/**
 * Data-scope composition spec for the ma_tool_cstb_rpt_properties READ API (findAll).
 *
 * DB-mocked (per repo convention — mirrors permission-then-interceptor-integration.spec.ts):
 * jest-mocked repos/redis, SQL-shape assertions. Does NOT execute real Postgres.
 *
 * Proves the table-specific guarantees that this feature rides on:
 *   - For a non-SO caller, DataScope collapses to the explicit branch
 *     (`rpt.id = ANY(...)`), NEVER the owner EXISTS branch — even when the caller
 *     owns OTHER resources (ownedRoots stays null; nothing maps to this table).
 *   - Whole-table SO does NOT widen the read API: an SO caller's ownedRoots is the
 *     sentinel `[0]`, so applyDataScope emits `rpt.id = ANY([0])` → empty. SO's
 *     "see all" lives only in the records browser (getRecords), not here.
 *   - default-deny (no grants) → `1 = 0`, including super_admin.
 *   - getAccessibleRecords for this table joins the target for soft-delete exclusion.
 *
 * The generic allow/deny/user-exception merge is already covered table-agnostically
 * in permission-query.service.spec.ts; here we assert it resolves for THIS table.
 */

import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { DataSource, Repository } from 'typeorm';
import { RedisAdapter } from '@common/infrastructure/redis.adapter';
import { UserType } from '@modules/databases/user.entity';
import { RoleDataAccess, UserDataAccess } from '@modules/databases/data-access.entity';
import { UserRole } from '@modules/databases/user-role.entity';
import { PERMISSION_META_KEY, DATA_ACCESS_META_KEY } from '@common/authorization/constants/authorization.constant';
import { DataAccessInterceptor } from '@common/authorization/interceptors/data-access.interceptor';
import { PermissionGuard } from '@common/authorization/guards/permission.guard';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import { PermissionCacheService } from '@common/authorization/services/permission-cache.service';
import { PermissionQueryService } from '@common/authorization/services/permission-query.service';
import { applyDataScope } from '@modules/data-access/helpers/data-scope-applier';
import type { DataScope } from '@common/authorization/types/data-scope.types';

jest.mock('@common/infrastructure/redis.adapter');

const TABLE = 'ma_tool_cstb_rpt_properties';
const VIEW = 'ma_tool_report_view';

// Records andWhere fragments + bound params so the emitted predicate can be inspected.
function makeScopeQb() {
  const andWhereSql: string[] = [];
  const params: unknown[] = [];
  const qb: any = {
    andWhereSql,
    params,
    andWhere: jest.fn((sql: string) => {
      andWhereSql.push(sql);
      return qb;
    }),
    setParameter: jest.fn((_name: string, value: unknown) => {
      params.push(value);
      return qb;
    }),
  };
  return qb;
}

describe('ma_tool_cstb_rpt_properties — explicit-only scope composition', () => {
  const USER_ID = 100;
  const OWNED_DEPT = 1; // caller owns a bicc_department — must NOT leak into this table

  const dsQuery = jest.fn();
  const ds = { query: dsQuery } as unknown as DataSource;
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const queryService = {
    getUserPermissions: jest.fn(),
    getAccessibleRecords: jest.fn(),
    getUserIdsByRole: jest.fn(),
  };

  let permissionCache: PermissionCacheService;
  let ownerScope: OwnerScopeResolverService;
  let permissionGuard: PermissionGuard;
  let interceptor: DataAccessInterceptor;

  const fakeNext: CallHandler = { handle: jest.fn().mockReturnValue(of('ok')) };

  const buildCtx = (info: Record<string, unknown>): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ info }) }),
    }) as unknown as ExecutionContext;

  const mockMeta = () =>
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) =>
      key === PERMISSION_META_KEY ? [VIEW] : { tableName: TABLE, permissionCode: VIEW },
    );

  beforeEach(() => {
    jest.clearAllMocks();
    dsQuery.mockReset();
    (RedisAdapter.get as jest.Mock).mockResolvedValue(null);
    (RedisAdapter.set as jest.Mock).mockResolvedValue(undefined);
    (RedisAdapter.unlinkKeyByPattern as jest.Mock).mockResolvedValue([]);

    permissionCache = new PermissionCacheService(queryService as any);
    ownerScope = new OwnerScopeResolverService(ds, permissionCache);
    permissionGuard = new PermissionGuard(reflector, permissionCache, ownerScope);
    interceptor = new DataAccessInterceptor(reflector, permissionCache, ownerScope);
    mockMeta();
  });

  // Drive guard → interceptor and return the resolved DataScope.
  async function resolveScope(info: Record<string, unknown>): Promise<DataScope> {
    await permissionGuard.canActivate(buildCtx(info));
    await interceptor.intercept(buildCtx(info), fakeNext);
    return info.dataScope as DataScope;
  }

  it('A. role grant → explicit set, ownedRoots null, predicate = explicit ANY (no EXISTS)', async () => {
    queryService.getUserPermissions.mockResolvedValue([VIEW]); // role-path → verbFromExplicit=true
    queryService.getAccessibleRecords.mockResolvedValue([1, 2]); // record 3 excluded
    // Interceptor getOwnedRoots: caller owns a bicc_department — should NOT map to this table.
    dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: OWNED_DEPT, role_id: 7 }]);

    const scope = await resolveScope({ user: { id: USER_ID }, client: 'user' });
    expect(scope).toEqual({ explicit: [1, 2], ownedRoots: null });

    const qb = makeScopeQb();
    applyDataScope(qb, 'rpt', TABLE, scope);
    const joined = qb.andWhereSql.join(' | ');
    expect(joined).toContain('rpt.id = ANY(');
    expect(joined).not.toContain('EXISTS (');
  });

  it('B. user-exception allow merges into explicit set (record 4 included)', async () => {
    queryService.getUserPermissions.mockResolvedValue([VIEW]);
    // getAccessibleRecords already merges allow_role ∪ allow_user − deny; record 4 = user exception.
    queryService.getAccessibleRecords.mockResolvedValue([1, 2, 4]);
    dsQuery.mockResolvedValueOnce([]);

    const scope = await resolveScope({ user: { id: USER_ID }, client: 'user' });
    expect(scope.explicit).toEqual(expect.arrayContaining([4]));
    expect(scope.ownedRoots).toBeNull();
  });

  it('C. deny subtracts (record 2 removed from explicit set)', async () => {
    queryService.getUserPermissions.mockResolvedValue([VIEW]);
    queryService.getAccessibleRecords.mockResolvedValue([1, 3]); // 2 denied
    dsQuery.mockResolvedValueOnce([]);

    const scope = await resolveScope({ user: { id: USER_ID }, client: 'user' });
    expect(scope.explicit).not.toContain(2);
    expect(scope.ownedRoots).toBeNull();
  });

  it('D. default-deny (zero grants) → 1 = 0 predicate', async () => {
    queryService.getUserPermissions.mockResolvedValue([VIEW]);
    queryService.getAccessibleRecords.mockResolvedValue([]);
    dsQuery.mockResolvedValueOnce([]);

    const scope = await resolveScope({ user: { id: USER_ID }, client: 'user' });
    expect(scope).toEqual({ explicit: [], ownedRoots: null });

    const qb = makeScopeQb();
    applyDataScope(qb, 'rpt', TABLE, scope);
    expect(qb.andWhereSql.join(' | ')).toContain('1 = 0');
  });

  it('D(super_admin). super_admin without grants is scoped like everyone → 1 = 0', async () => {
    queryService.getAccessibleRecords.mockResolvedValue([]); // no grants
    dsQuery.mockResolvedValueOnce([]); // no owner rows

    const scope = await resolveScope({ user: { id: USER_ID, type: UserType.SUPER_ADMIN }, client: 'admin' });
    expect(scope).toEqual({ explicit: [], ownedRoots: null });

    const qb = makeScopeQb();
    applyDataScope(qb, 'rpt', TABLE, scope);
    expect(qb.andWhereSql.join(' | ')).toContain('1 = 0');
  });

  it('E. ownedRoots invariant: null even when caller owns other resources', async () => {
    queryService.getUserPermissions.mockResolvedValue([VIEW]);
    queryService.getAccessibleRecords.mockResolvedValue([5]);
    // Caller owns TWO bicc_departments — neither maps to ma_tool_cstb_rpt_properties.
    dsQuery.mockResolvedValueOnce([
      { resource_type: 'bicc_department', resource_id: 1, role_id: 7 },
      { resource_type: 'bicc_department', resource_id: 2, role_id: 7 },
    ]);

    const scope = await resolveScope({ user: { id: USER_ID }, client: 'user' });
    expect(scope.ownedRoots).toBeNull();

    const qb = makeScopeQb();
    applyDataScope(qb, 'rpt', TABLE, scope);
    expect(qb.andWhereSql.join(' | ')).not.toContain('EXISTS (');
  });

  it('SO-sentinel does NOT widen findAll: ownedRoots=[0] → rpt.id = ANY([0]) → empty', async () => {
    // SO caller holds the view verb ONLY via the owner-implied path (no role grant).
    queryService.getUserPermissions.mockResolvedValue([]); // no explicit view
    queryService.getAccessibleRecords.mockResolvedValue([]); // suppressed anyway (owner-only path)
    const sentinelRow = [{ resource_type: 'ma_tool_report', resource_id: 0, role_id: 7 }];
    dsQuery
      .mockResolvedValueOnce(sentinelRow) // PermissionGuard: getUserOwnerScope
      .mockResolvedValueOnce([{ code: VIEW }]) // PermissionGuard: implied-verbs query
      .mockResolvedValueOnce(sentinelRow); // Interceptor: getOwnedRoots → getUserOwnerScope

    const scope = await resolveScope({ user: { id: USER_ID }, client: 'user' });
    // Owner scope resolves to the whole-table sentinel, NOT null and NOT all-access.
    expect(scope.explicit).toEqual([]);
    expect(scope.ownedRoots).toEqual({ rootTable: TABLE, rootIds: [0] });

    const qb = makeScopeQb();
    applyDataScope(qb, 'rpt', TABLE, scope);
    const joined = qb.andWhereSql.join(' | ');
    // Emits the sentinel id filter (matches no real row) — never a bare TRUE / 1=1.
    expect(joined).toContain('rpt.id = ANY(');
    expect(joined).not.toContain('EXISTS (');
    expect(joined).not.toContain('1 = 1');
    // The bound param is the sentinel [0], so the read API returns nothing extra.
    expect(qb.params.some((p) => Array.isArray(p) && p.length === 1 && p[0] === 0)).toBe(true);
  });
});

// ── F. soft-delete: getAccessibleRecords joins the target table to exclude deleted ──
describe('getAccessibleRecords — soft-delete exclusion for ma_tool_cstb_rpt_properties', () => {
  function mockRepo(rows: unknown[]) {
    const qb: Record<string, jest.Mock> = {};
    qb.createQueryBuilder = jest.fn().mockReturnValue(qb);
    qb.innerJoin = jest.fn().mockReturnValue(qb);
    qb.select = jest.fn().mockReturnValue(qb);
    qb.where = jest.fn().mockReturnValue(qb);
    qb.andWhere = jest.fn().mockReturnValue(qb);
    qb.getRawMany = jest.fn().mockResolvedValue(rows);
    return qb;
  }

  it('joins ma_tool_cstb_rpt_properties and filters soft-deleted rows', async () => {
    const userRoleRepo = mockRepo([{ role_id: 1 }]);
    const userDataAccessRepo = mockRepo([]);
    const roleDataAccessRepo = mockRepo([]);

    const service = new PermissionQueryService(
      userRoleRepo as unknown as Repository<UserRole>,
      userDataAccessRepo as unknown as Repository<UserDataAccess>,
      roleDataAccessRepo as unknown as Repository<RoleDataAccess>,
    );

    await service.getAccessibleRecords(10, TABLE, VIEW);

    expect(roleDataAccessRepo.innerJoin).toHaveBeenCalledWith(TABLE, 'rec', 'rec.id = da.data_id');
    expect(userDataAccessRepo.innerJoin).toHaveBeenCalledWith(TABLE, 'rec', 'rec.id = da.data_id');
    expect(roleDataAccessRepo.andWhere).toHaveBeenCalledWith('rec.is_deleted IS NOT TRUE');
    expect(roleDataAccessRepo.andWhere).toHaveBeenCalledWith('rec.deleted_at IS NULL');
  });
});
