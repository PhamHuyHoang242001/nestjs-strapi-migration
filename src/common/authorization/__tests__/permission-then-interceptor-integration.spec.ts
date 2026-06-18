/**
 * PermissionGuard → DataAccessInterceptor composed integration spec (Option B).
 *
 * Verifies the runtime composition: PermissionGuard sets `verbFromExplicit`,
 * DataAccessInterceptor reads it and decides whether to fetch the explicit
 * grants branch. This is the end-to-end behavior the business rules ride on.
 *
 * Matrix covered (user × verb-resolution-path):
 *   A. super_admin                    → verbFromExplicit=true, full union
 *   B. role-only path (verb in role.permissions)
 *                                     → verbFromExplicit=true, full union
 *   C. owner-only path (verb only in owner_role.verbs)
 *                                     → verbFromExplicit=false, explicit suppressed
 *   D. mixed verbs, all explicit      → verbFromExplicit=true, full union
 *   D'. mixed verbs, one implied      → verbFromExplicit=false, explicit suppressed
 *                                       (conservative: any implied verb collapses scope)
 */

import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { DataSource } from 'typeorm';
import { RedisAdapter } from '@common/infrastructure/redis.adapter';
import { UserType } from '@modules/databases/user.entity';
import { PERMISSION_META_KEY, DATA_ACCESS_META_KEY } from '../constants/authorization.constant';
import { DataAccessInterceptor } from '../interceptors/data-access.interceptor';
import { PermissionGuard } from '../guards/permission.guard';
import { OwnerScopeResolverService } from '../services/owner-scope-resolver.service';
import { PermissionCacheService } from '../services/permission-cache.service';

jest.mock('@common/infrastructure/redis.adapter');

describe('PermissionGuard → DataAccessInterceptor (Option B composed)', () => {
  const USER_ID = 100;
  const OWNED_DEPT = 1;
  const EXPLICIT_REPORT = 999;
  const IMPLIED_VERBS = ['bh_diag_report_view', 'bh_diag_report_edit'];

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

  function mockMeta(map: Record<string, unknown>) {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation((key: string) => map[key]);
  }

  function queueDsQueries(...rows: any[][]) {
    for (const r of rows) dsQuery.mockResolvedValueOnce(r);
  }

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
  });

  // ── Case A: super_admin ────────────────────────────────────────────────

  // NOTE on dsQuery counts below:
  //   PermissionGuard.getUserImpliedVerbs   → 1× getUserOwnerScope + 1× implied-verbs query
  //   DataAccessInterceptor.getOwnedRoots   → 1× getUserOwnerScope  (cache mocked null → re-fetch)
  // Cases that probe both (C, D') need 3 dsQuery rows queued.

  it('A. super_admin → verbFromExplicit=true, full union (explicit + owned)', async () => {
    mockMeta({
      [PERMISSION_META_KEY]: ['bh_diag_report_view'],
      [DATA_ACCESS_META_KEY]: { tableName: 'bi_hub_diagnostic_reports', permissionCode: 'bh_diag_report_view' },
    });
    queryService.getAccessibleRecords.mockResolvedValue([EXPLICIT_REPORT]);
    // PermissionGuard early-exits for super_admin (no DB). Interceptor fetches owner scope.
    queueDsQueries([{ resource_type: 'bicc_department', resource_id: OWNED_DEPT, role_id: 7 }]);

    const info: Record<string, unknown> = { user: { id: USER_ID, type: UserType.SUPER_ADMIN }, client: 'admin' };
    await permissionGuard.canActivate(buildCtx(info));
    expect(info.verbFromExplicit).toBe(true);

    await interceptor.intercept(buildCtx(info), fakeNext);
    expect(queryService.getAccessibleRecords).toHaveBeenCalled();
    expect(info.dataScope).toEqual({
      explicit: [EXPLICIT_REPORT],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [OWNED_DEPT] },
    });
  });

  // ── Case B: explicit-only role path ────────────────────────────────────

  it('B. role.permissions ∋ verb → verbFromExplicit=true, full union', async () => {
    mockMeta({
      [PERMISSION_META_KEY]: ['bh_diag_report_view'],
      [DATA_ACCESS_META_KEY]: { tableName: 'bi_hub_diagnostic_reports', permissionCode: 'bh_diag_report_view' },
    });
    // permissionCache hasPermission delegates to getUserPermissions
    queryService.getUserPermissions.mockResolvedValue(['bh_diag_report_view']);
    queryService.getAccessibleRecords.mockResolvedValue([EXPLICIT_REPORT]);
    // PermissionGuard skips owner probe (verb in role.permissions). Interceptor fetches owner scope.
    queueDsQueries([]);

    const info: Record<string, unknown> = { user: { id: USER_ID }, client: 'user' };
    await permissionGuard.canActivate(buildCtx(info));
    expect(info.verbFromExplicit).toBe(true);

    await interceptor.intercept(buildCtx(info), fakeNext);
    expect(queryService.getAccessibleRecords).toHaveBeenCalled();
    expect(info.dataScope).toEqual({ explicit: [EXPLICIT_REPORT], ownedRoots: null });
  });

  // ── Case C: owner-only implied path — the Option B target case ─────────

  it('C. owner-only implied verb → verbFromExplicit=false, explicit SUPPRESSED', async () => {
    mockMeta({
      [PERMISSION_META_KEY]: ['bh_diag_report_view'],
      [DATA_ACCESS_META_KEY]: { tableName: 'bi_hub_diagnostic_reports', permissionCode: 'bh_diag_report_view' },
    });
    queryService.getUserPermissions.mockResolvedValue([]); // no role.permissions
    queueDsQueries(
      [{ resource_type: 'bicc_department', resource_id: OWNED_DEPT, role_id: 7 }], // PG: getUserOwnerScope
      IMPLIED_VERBS.map((code) => ({ code })), // PG: implied-verbs query
      [{ resource_type: 'bicc_department', resource_id: OWNED_DEPT, role_id: 7 }], // Interceptor: getUserOwnerScope (cache mocked null)
    );
    queryService.getAccessibleRecords.mockResolvedValue([EXPLICIT_REPORT]); // would-be leak

    const info: Record<string, unknown> = { user: { id: USER_ID }, client: 'user' };
    await permissionGuard.canActivate(buildCtx(info));
    expect(info.verbFromExplicit).toBe(false);

    await interceptor.intercept(buildCtx(info), fakeNext);
    // Critical assertion: explicit fetch SKIPPED entirely
    expect(queryService.getAccessibleRecords).not.toHaveBeenCalled();
    expect(info.dataScope).toEqual({
      explicit: [],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [OWNED_DEPT] },
    });
  });

  // ── Case D: mixed verbs, ALL resolve via role.permissions ──────────────

  it('D. multi-verb endpoint, all in role.permissions → verbFromExplicit=true', async () => {
    mockMeta({
      [PERMISSION_META_KEY]: ['bh_diag_report_view', 'bh_diag_report_edit'],
      [DATA_ACCESS_META_KEY]: { tableName: 'bi_hub_diagnostic_reports', permissionCode: 'bh_diag_report_edit' },
    });
    queryService.getUserPermissions.mockResolvedValue(['bh_diag_report_view', 'bh_diag_report_edit']);
    queryService.getAccessibleRecords.mockResolvedValue([10, 11]);
    queueDsQueries([]); // Interceptor only — PG never probes owner scope

    const info: Record<string, unknown> = { user: { id: USER_ID }, client: 'user' };
    await permissionGuard.canActivate(buildCtx(info));
    expect(info.verbFromExplicit).toBe(true);

    await interceptor.intercept(buildCtx(info), fakeNext);
    expect(queryService.getAccessibleRecords).toHaveBeenCalled();
    expect(info.dataScope).toEqual({ explicit: [10, 11], ownedRoots: null });
  });

  // ── Case D': mixed verbs, ONE resolves via implied → collapse to owner-only ─

  it("D'. multi-verb, ONE verb only in impliedVerbs → verbFromExplicit=false (conservative)", async () => {
    mockMeta({
      [PERMISSION_META_KEY]: ['bh_diag_report_view', 'bh_diag_report_edit'],
      [DATA_ACCESS_META_KEY]: { tableName: 'bi_hub_diagnostic_reports', permissionCode: 'bh_diag_report_edit' },
    });
    // User has 'bh_diag_report_view' in role.permissions but NOT 'bh_diag_report_edit'
    queryService.getUserPermissions.mockResolvedValue(['bh_diag_report_view']);
    queueDsQueries(
      [{ resource_type: 'bicc_department', resource_id: OWNED_DEPT, role_id: 7 }], // PG getUserOwnerScope
      IMPLIED_VERBS.map((code) => ({ code })), // PG implied-verbs
      [{ resource_type: 'bicc_department', resource_id: OWNED_DEPT, role_id: 7 }], // Interceptor getUserOwnerScope
    );
    queryService.getAccessibleRecords.mockResolvedValue([42]); // would-be leak

    const info: Record<string, unknown> = { user: { id: USER_ID }, client: 'user' };
    await permissionGuard.canActivate(buildCtx(info));
    expect(info.verbFromExplicit).toBe(false);

    await interceptor.intercept(buildCtx(info), fakeNext);
    expect(queryService.getAccessibleRecords).not.toHaveBeenCalled();
    expect(info.dataScope).toEqual({
      explicit: [],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [OWNED_DEPT] },
    });
  });

  // ── Edge: endpoint has @RequireDataAccess but NO @RequirePermission ────

  it('Edge: no @RequirePermission → verbFromExplicit stays undefined → interceptor defaults to full union', async () => {
    mockMeta({
      // PERMISSION_META_KEY intentionally absent
      [DATA_ACCESS_META_KEY]: { tableName: 'bi_hub_diagnostic_reports', permissionCode: 'bh_diag_report_view' },
    });
    queryService.getAccessibleRecords.mockResolvedValue([42]);
    queueDsQueries([{ resource_type: 'bicc_department', resource_id: OWNED_DEPT, role_id: 7 }]);

    const info: Record<string, unknown> = { user: { id: USER_ID }, client: 'user' };
    await permissionGuard.canActivate(buildCtx(info));
    expect(info.verbFromExplicit).toBeUndefined();

    await interceptor.intercept(buildCtx(info), fakeNext);
    expect(queryService.getAccessibleRecords).toHaveBeenCalled();
    expect(info.dataScope).toEqual({
      explicit: [42],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [OWNED_DEPT] },
    });
  });
});
