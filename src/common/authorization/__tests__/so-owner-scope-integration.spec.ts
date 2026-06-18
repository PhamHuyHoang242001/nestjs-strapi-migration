/**
 * SO Owner-Scope Integration spec.
 *
 * Composes OwnerScopeResolverService + PermissionGuard + OwnerScopeGuard +
 * DataAccessInterceptor + applyDataScope() end-to-end (DB-mocked for unit speed)
 * over the predicate-pushdown design:
 *
 *   #2  SO reads owned subtree           — interceptor emits ownedRoots branch
 *   #2b SO with non-matching rootTable    — ownedRoots null
 *   #3  SO writes owned record            — OwnerScopeGuard pass
 *   #3b SO writes cross-scope             — OwnerScopeGuard reject
 *   #6c SO + explicit grant union         — both branches populated when verbFromExplicit≠false
 *   #6d SO owner-only path                — verbFromExplicit=false collapses to owned branch
 *   #8  DENY bypass within owned scope    — helper SQL keeps owned records
 *   SQL regression guard                  — emitted SQL contains `EXISTS (`
 *
 * Implied-verb tests for PermissionGuard remain unchanged from prior shape.
 */

import { ExecutionContext, ForbiddenException, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { DataSource } from 'typeorm';
import { RedisAdapter } from '@common/infrastructure/redis.adapter';
import { PERMISSION_META_KEY, DATA_ACCESS_META_KEY, OWNER_SCOPE_META_KEY } from '../constants/authorization.constant';
import { DataAccessInterceptor } from '../interceptors/data-access.interceptor';
import { OwnerScopeGuard } from '../guards/owner-scope.guard';
import { PermissionGuard } from '../guards/permission.guard';
import { OwnerScopeResolverService } from '../services/owner-scope-resolver.service';
import { PermissionCacheService } from '../services/permission-cache.service';
import { applyDataScope } from '@modules/data-access/helpers/data-scope-applier';
import type { DataScope } from '../types/data-scope.types';

jest.mock('@common/infrastructure/redis.adapter');

const SCENARIO = {
  user_id: 100,
  owned_root: 1,
  owned_dept_subtree_reports: [10, 11], // records under dept=1
  explicit_grant_report: 999, // dept=2, in Role D grant
  implied_verbs: ['bh_diag_report_view', 'bh_diag_report_edit', 'bh_diag_report_delete'],
};

describe('SO Owner-Scope Integration', () => {
  const dsQuery = jest.fn();
  const ds = { query: dsQuery } as any;
  let permissionCache: PermissionCacheService;
  let ownerScope: OwnerScopeResolverService;
  let permissionGuard: PermissionGuard;
  let ownerScopeGuard: OwnerScopeGuard;
  let interceptor: DataAccessInterceptor;
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;

  const queryService = {
    getUserPermissions: jest.fn(),
    getAccessibleRecords: jest.fn(),
    getUserIdsByRole: jest.fn(),
  };

  const ctx = (info: Record<string, unknown>, body: any = {}, params: any = {}): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ info, body, params }) }),
    }) as unknown as ExecutionContext;

  const fakeNext: CallHandler = { handle: jest.fn().mockReturnValue(of('ok')) };

  beforeEach(() => {
    jest.clearAllMocks();
    dsQuery.mockReset();
    (RedisAdapter.get as jest.Mock).mockResolvedValue(null);
    (RedisAdapter.set as jest.Mock).mockResolvedValue(undefined);
    (RedisAdapter.unlinkKeyByPattern as jest.Mock).mockResolvedValue([]);

    permissionCache = new PermissionCacheService(queryService as any);
    ownerScope = new OwnerScopeResolverService(ds, permissionCache);
    permissionGuard = new PermissionGuard(reflector, permissionCache, ownerScope);
    ownerScopeGuard = new OwnerScopeGuard(reflector, ownerScope);
    interceptor = new DataAccessInterceptor(reflector, permissionCache, ownerScope);
  });

  function mockReflector(map: Record<string, unknown>) {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => map[key]);
  }

  function queueQueries(...resultsInOrder: any[][]) {
    for (const r of resultsInOrder) dsQuery.mockResolvedValueOnce(r);
  }

  // ── Scenario 2: SO reads owned subtree → dataScope.ownedRoots populated ──

  it('Scenario #2: SO reads owned subtree → interceptor emits dataScope with ownedRoots', async () => {
    mockReflector({
      [DATA_ACCESS_META_KEY]: { tableName: 'bi_hub_diagnostic_reports', permissionCode: 'bh_diag_report_view' },
    });
    queryService.getAccessibleRecords.mockResolvedValue([]); // no explicit grants
    queueQueries([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]); // owner scope row

    const info: Record<string, unknown> = { user: { id: SCENARIO.user_id }, client: 'user' };
    await interceptor.intercept(ctx(info), fakeNext);

    expect(info.dataScope).toEqual({
      explicit: [],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [SCENARIO.owned_root] },
    });
  });

  // ── Scenario 2b: SO with rootTable mismatch → ownedRoots null ──

  it('Scenario #2b: SO with owner scope on different service → ownedRoots null for cross-service table', async () => {
    mockReflector({
      [DATA_ACCESS_META_KEY]: { tableName: 'ma_tool_documents', permissionCode: 'doc_view' },
    });
    queryService.getAccessibleRecords.mockResolvedValue([]);
    queueQueries([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]); // SO of bicc_dept only

    const info: Record<string, unknown> = { user: { id: SCENARIO.user_id }, client: 'user' };
    await interceptor.intercept(ctx(info), fakeNext);

    expect(info.dataScope).toEqual({ explicit: [], ownedRoots: null });
  });

  // ── Scenario 3: SO writes owned record (OwnerScopeGuard allows) ────────

  it('Scenario #3: SO writes record under owned root → OwnerScopeGuard passes', async () => {
    mockReflector({
      [OWNER_SCOPE_META_KEY]: { table: 'bi_hub_bicc_departments', scopeFromParam: 'id' },
    });
    queueQueries(
      [{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }], // owner scope
      [{ exists: 1 }], // walk-up check passes
    );

    await expect(
      ownerScopeGuard.canActivate(ctx({ user: { id: SCENARIO.user_id }, client: 'user' }, {}, { id: 1 })),
    ).resolves.toBe(true);
  });

  // ── Scenario 3b: SO writes cross-scope → 403 ────────────────────────────

  it('Scenario #3b: SO writes record OUTSIDE owned root → OwnerScopeGuard rejects', async () => {
    mockReflector({
      [OWNER_SCOPE_META_KEY]: { table: 'bi_hub_bicc_departments', scopeFromParam: 'id' },
    });
    queueQueries(
      [{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }],
      [], // walk-up returns no match for dept=2
    );

    await expect(
      ownerScopeGuard.canActivate(ctx({ user: { id: SCENARIO.user_id }, client: 'user' }, {}, { id: 2 })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ── Scenario 6c: SO + explicit grant union ─────────────────────────────

  it('Scenario #6c: SO + explicit grant on cross-scope record → both branches populated', async () => {
    mockReflector({
      [DATA_ACCESS_META_KEY]: { tableName: 'bi_hub_diagnostic_reports', permissionCode: 'bh_diag_report_view' },
    });
    queryService.getAccessibleRecords.mockResolvedValue([SCENARIO.explicit_grant_report]);
    queueQueries([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);

    const info: Record<string, unknown> = { user: { id: SCENARIO.user_id }, client: 'user' };
    await interceptor.intercept(ctx(info), fakeNext);

    expect(info.dataScope).toEqual({
      explicit: [SCENARIO.explicit_grant_report],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [SCENARIO.owned_root] },
    });
  });

  // ── Scenario 6d: SO owner-only path — explicit branch suppressed ───────
  //
  // PermissionGuard sets verbFromExplicit=false when every required verb was
  // resolved only via owner_role.verbs (no role.permissions hit). The
  // interceptor then skips the explicit-grants fetch entirely, so an admin
  // allow-grant on a cross-scope record can never widen visibility for an
  // owner-path caller.

  it('Scenario #6d: SO with owner-only path (verbFromExplicit=false) → explicit suppressed', async () => {
    mockReflector({
      [DATA_ACCESS_META_KEY]: { tableName: 'bi_hub_diagnostic_reports', permissionCode: 'bh_diag_report_download' },
    });
    queryService.getAccessibleRecords.mockResolvedValue([SCENARIO.explicit_grant_report]); // would-be leak
    queueQueries([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);

    const info: Record<string, unknown> = {
      user: { id: SCENARIO.user_id },
      client: 'user',
      verbFromExplicit: false,
    };
    await interceptor.intercept(ctx(info), fakeNext);

    expect(queryService.getAccessibleRecords).not.toHaveBeenCalled();
    expect(info.dataScope).toEqual({
      explicit: [],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [SCENARIO.owned_root] },
    });
  });

  // ── Scenario 8: DENY bypass — owner branch surfaces records denied in explicit ──

  it('Scenario #8: explicit DENY rule on owned record is bypassed by owner branch (via SQL OR)', async () => {
    mockReflector({
      [DATA_ACCESS_META_KEY]: { tableName: 'bi_hub_diagnostic_reports', permissionCode: 'bh_diag_report_view' },
    });
    // getAccessibleRecords returns (allow \ deny); record 10 explicitly denied → not in explicit set.
    queryService.getAccessibleRecords.mockResolvedValue([]);
    queueQueries([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);

    const info: Record<string, unknown> = { user: { id: SCENARIO.user_id }, client: 'user' };
    await interceptor.intercept(ctx(info), fakeNext);

    // Owner branch populated even though explicit empty — applyDataScope SQL OR re-includes owned subtree.
    expect(info.dataScope).toEqual({
      explicit: [],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [SCENARIO.owned_root] },
    });
  });

  // ── SQL regression guard ────────────────────────────────────────────────

  it('SQL regression guard: applyDataScope emits EXISTS clause for owner branch (1-hop)', async () => {
    // Standalone DataSource (no connect) — getQueryAndParameters() builds SQL from QB metadata.
    const dataSource = new DataSource({ type: 'postgres', entities: [], synchronize: false });
    const qb = dataSource.createQueryBuilder().select('r.id').from('bi_hub_diagnostic_reports', 'r');

    const scope: DataScope = {
      explicit: [],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [SCENARIO.owned_root] },
    };
    applyDataScope(qb, 'r', 'bi_hub_diagnostic_reports', scope);
    const [sql] = qb.getQueryAndParameters();

    expect(sql).toContain('EXISTS (');
    expect(sql).toContain('bi_hub_bicc_departments');
  });

  it('SQL regression guard: applyDataScope emits root-only ANY() when tableName === rootTable', async () => {
    const dataSource = new DataSource({ type: 'postgres', entities: [], synchronize: false });
    const qb = dataSource.createQueryBuilder().select('d.id').from('bi_hub_bicc_departments', 'd');

    const scope: DataScope = {
      explicit: [],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [1, 2] },
    };
    applyDataScope(qb, 'd', 'bi_hub_bicc_departments', scope);
    const [sql] = qb.getQueryAndParameters();

    expect(sql).not.toContain('EXISTS (');
    expect(sql).toMatch(/d\.id = ANY\(\$\d+\)/);
  });

  // ── PermissionGuard + impliedVerbs ─────────────────────────────────────

  it('PermissionGuard: SO without role.permissions but with verb in impliedVerbs → pass', async () => {
    mockReflector({ [PERMISSION_META_KEY]: ['bh_diag_report_view'] });
    queryService.getUserPermissions.mockResolvedValue([]); // no role perms
    queueQueries(
      [{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }],
      SCENARIO.implied_verbs.map((code) => ({ code })),
    );

    await expect(permissionGuard.canActivate(ctx({ user: { id: SCENARIO.user_id }, client: 'user' }))).resolves.toBe(
      true,
    );
  });

  it('PermissionGuard: SO without verb in impliedVerbs (cross-service) → 403', async () => {
    mockReflector({ [PERMISSION_META_KEY]: ['workspace_edit'] });
    queryService.getUserPermissions.mockResolvedValue([]);
    queueQueries(
      [{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }],
      SCENARIO.implied_verbs.map((code) => ({ code })), // bi_hub verbs only — no workspace_edit
    );

    await expect(
      permissionGuard.canActivate(ctx({ user: { id: SCENARIO.user_id }, client: 'user' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
