import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { UserType } from '@modules/databases/user.entity';
import { DataAccessInterceptor } from '../interceptors/data-access.interceptor';
import { OwnerScopeResolverService } from '../services/owner-scope-resolver.service';
import { PermissionCacheService } from '../services/permission-cache.service';

describe('DataAccessInterceptor — dataScope shape', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const permissionCache = {
    getAccessibleRecords: jest.fn(),
  };
  const ownerScope = { getOwnedRoots: jest.fn() };
  let interceptor: DataAccessInterceptor;

  const next: CallHandler = { handle: jest.fn().mockReturnValue(of(null)) };
  const context = (info: Record<string, unknown>): ExecutionContext => {
    const req = { info };
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector.getAllAndOverride.mockReset();
    permissionCache.getAccessibleRecords.mockReset();
    ownerScope.getOwnedRoots.mockReset();
    interceptor = new DataAccessInterceptor(
      reflector as unknown as Reflector,
      permissionCache as unknown as PermissionCacheService,
      ownerScope as unknown as OwnerScopeResolverService,
    );
  });

  it('passes through when no meta is set — dataScope untouched', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const info: Record<string, unknown> = { user: { id: 1 }, client: 'user' };
    await interceptor.intercept(context(info), next);

    expect(permissionCache.getAccessibleRecords).not.toHaveBeenCalled();
    expect(ownerScope.getOwnedRoots).not.toHaveBeenCalled();
    expect(info.dataScope).toBeUndefined();
  });

  it('super_admin user → dataScope still resolved (no bypass — SO + explicit grants apply)', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      tableName: 'bi_hub_diagnostic_reports',
      permissionCode: 'bh_diag_report_view',
    });
    permissionCache.getAccessibleRecords.mockResolvedValue([42]);
    ownerScope.getOwnedRoots.mockResolvedValue([7]);

    const info: Record<string, unknown> = { user: { id: 1, type: UserType.SUPER_ADMIN }, client: 'user' };
    await interceptor.intercept(context(info), next);

    expect(info.dataScope).toEqual({
      explicit: [42],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [7] },
    });
    expect(permissionCache.getAccessibleRecords).toHaveBeenCalled();
    expect(ownerScope.getOwnedRoots).toHaveBeenCalled();
  });

  it('throws ForbiddenException when user is not authenticated', async () => {
    reflector.getAllAndOverride.mockReturnValue({ tableName: 'bi_hub_reports', permissionCode: 'report_view' });

    await expect(interceptor.intercept(context({ client: 'user' }), next)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('user with only explicit grants → dataScope.explicit populated, ownedRoots null', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      tableName: 'bi_hub_diagnostic_reports',
      permissionCode: 'bh_diag_report_view',
    });
    permissionCache.getAccessibleRecords.mockResolvedValue([1, 2, 3]);
    ownerScope.getOwnedRoots.mockResolvedValue([]);

    const info: Record<string, unknown> = { user: { id: 1 }, client: 'user' };
    await interceptor.intercept(context(info), next);

    expect(info.dataScope).toEqual({ explicit: [1, 2, 3], ownedRoots: null });
  });

  it('user with only owner roots → dataScope.ownedRoots populated, explicit empty', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      tableName: 'bi_hub_diagnostic_reports',
      permissionCode: 'bh_diag_report_view',
    });
    permissionCache.getAccessibleRecords.mockResolvedValue([]);
    ownerScope.getOwnedRoots.mockResolvedValue([5]);

    const info: Record<string, unknown> = { user: { id: 1 }, client: 'user' };
    await interceptor.intercept(context(info), next);

    expect(info.dataScope).toEqual({
      explicit: [],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [5] },
    });
    expect(ownerScope.getOwnedRoots).toHaveBeenCalledWith(1, 'bi_hub_bicc_departments');
  });

  it('user with both explicit + owner roots → both branches populated', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      tableName: 'bi_hub_diagnostic_reports',
      permissionCode: 'bh_diag_report_view',
    });
    permissionCache.getAccessibleRecords.mockResolvedValue([100, 101]);
    ownerScope.getOwnedRoots.mockResolvedValue([7]);

    const info: Record<string, unknown> = { user: { id: 1 }, client: 'user' };
    await interceptor.intercept(context(info), next);

    expect(info.dataScope).toEqual({
      explicit: [100, 101],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [7] },
    });
  });

  it('user with nothing → all branches empty/null', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      tableName: 'bi_hub_diagnostic_reports',
      permissionCode: 'bh_diag_report_view',
    });
    permissionCache.getAccessibleRecords.mockResolvedValue([]);
    ownerScope.getOwnedRoots.mockResolvedValue([]);

    const info: Record<string, unknown> = { user: { id: 1 }, client: 'user' };
    await interceptor.intercept(context(info), next);

    expect(info.dataScope).toEqual({ explicit: [], ownedRoots: null });
  });

  it('dataScope shape no longer carries a denies field (owner branch is immune to record-level deny)', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      tableName: 'bi_hub_diagnostic_reports',
      permissionCode: 'bh_diag_report_edit',
    });
    permissionCache.getAccessibleRecords.mockResolvedValue([]);
    ownerScope.getOwnedRoots.mockResolvedValue([7]);

    const info: Record<string, unknown> = { user: { id: 1 }, client: 'user' };
    await interceptor.intercept(context(info), next);

    expect(info.dataScope).not.toHaveProperty('denies');
    expect(info.dataScope).toEqual({
      explicit: [],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [7] },
    });
  });

  it('tableName not in HIERARCHY_MAP → ownedRoots = null, no ownerScope call', async () => {
    reflector.getAllAndOverride.mockReturnValue({ tableName: 'users', permissionCode: 'user_view' });
    permissionCache.getAccessibleRecords.mockResolvedValue([10]);

    const info: Record<string, unknown> = { user: { id: 1 }, client: 'user' };
    await interceptor.intercept(context(info), next);

    expect(info.dataScope).toEqual({ explicit: [10], ownedRoots: null });
    expect(ownerScope.getOwnedRoots).not.toHaveBeenCalled();
  });

  it('rootTable IS the table itself (bi_payment_projects, root with no owner config) → ownedRoots null when user owns none', async () => {
    reflector.getAllAndOverride.mockReturnValue({ tableName: 'bi_payment_projects', permissionCode: 'pay_view' });
    permissionCache.getAccessibleRecords.mockResolvedValue([10]);
    ownerScope.getOwnedRoots.mockResolvedValue([]);

    const info: Record<string, unknown> = { user: { id: 1 }, client: 'user' };
    await interceptor.intercept(context(info), next);

    expect(info.dataScope).toEqual({ explicit: [10], ownedRoots: null });
    expect(ownerScope.getOwnedRoots).toHaveBeenCalledWith(1, 'bi_payment_projects');
  });

  it('regression guard: interceptor never reintroduces the legacy accessibleDataIds field', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      tableName: 'bi_hub_diagnostic_reports',
      permissionCode: 'bh_diag_report_view',
    });
    permissionCache.getAccessibleRecords.mockResolvedValue([1, 2]);
    ownerScope.getOwnedRoots.mockResolvedValue([7]);

    const info: Record<string, unknown> = { user: { id: 1 }, client: 'user' };
    await interceptor.intercept(context(info), next);

    expect(info.accessibleDataIds).toBeUndefined();
  });

  // ── Option B: verbFromExplicit gating ──────────────────────────
  // PermissionGuard sets req.info.verbFromExplicit. When `false`, caller resolved
  // every required verb only via the owner-implied path, so the interceptor must
  // suppress the explicit branch entirely — otherwise an owner-only caller could
  // reach records granted by unrelated admin allow-grants.
  it('verbFromExplicit=false → explicit fetch skipped, dataScope.explicit forced to []', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      tableName: 'bi_hub_diagnostic_reports',
      permissionCode: 'bh_diag_report_download',
    });
    permissionCache.getAccessibleRecords.mockResolvedValue([99]); // should NOT be consulted
    ownerScope.getOwnedRoots.mockResolvedValue([7]);

    const info: Record<string, unknown> = { user: { id: 1 }, client: 'user', verbFromExplicit: false };
    await interceptor.intercept(context(info), next);

    expect(permissionCache.getAccessibleRecords).not.toHaveBeenCalled();
    expect(info.dataScope).toEqual({
      explicit: [],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [7] },
    });
  });

  it('verbFromExplicit=false + no owned roots → both branches empty (zero access)', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      tableName: 'bi_hub_diagnostic_reports',
      permissionCode: 'bh_diag_report_download',
    });
    ownerScope.getOwnedRoots.mockResolvedValue([]);

    const info: Record<string, unknown> = { user: { id: 1 }, client: 'user', verbFromExplicit: false };
    await interceptor.intercept(context(info), next);

    expect(permissionCache.getAccessibleRecords).not.toHaveBeenCalled();
    expect(info.dataScope).toEqual({ explicit: [], ownedRoots: null });
  });

  it('verbFromExplicit=true → both branches fetched (role/super_admin path)', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      tableName: 'bi_hub_diagnostic_reports',
      permissionCode: 'bh_diag_report_view',
    });
    permissionCache.getAccessibleRecords.mockResolvedValue([42]);
    ownerScope.getOwnedRoots.mockResolvedValue([7]);

    const info: Record<string, unknown> = { user: { id: 1 }, client: 'user', verbFromExplicit: true };
    await interceptor.intercept(context(info), next);

    expect(permissionCache.getAccessibleRecords).toHaveBeenCalled();
    expect(info.dataScope).toEqual({
      explicit: [42],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [7] },
    });
  });

  it('verbFromExplicit=undefined (no @RequirePermission) → defaults to full union (legacy behavior)', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      tableName: 'bi_hub_diagnostic_reports',
      permissionCode: 'bh_diag_report_view',
    });
    permissionCache.getAccessibleRecords.mockResolvedValue([42]);
    ownerScope.getOwnedRoots.mockResolvedValue([7]);

    const info: Record<string, unknown> = { user: { id: 1 }, client: 'user' }; // no verbFromExplicit
    await interceptor.intercept(context(info), next);

    expect(permissionCache.getAccessibleRecords).toHaveBeenCalled();
    expect(info.dataScope).toEqual({
      explicit: [42],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [7] },
    });
  });

  it('runs 2 fetches in parallel (Promise.all)', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      tableName: 'bi_hub_diagnostic_reports',
      permissionCode: 'bh_diag_report_view',
    });
    const sleep = (ms: number, val: number[]) => new Promise<number[]>((resolve) => setTimeout(() => resolve(val), ms));
    permissionCache.getAccessibleRecords.mockImplementation(() => sleep(40, [1]));
    ownerScope.getOwnedRoots.mockImplementation(() => sleep(40, [7]));

    const info: Record<string, unknown> = { user: { id: 1 }, client: 'user' };
    const start = Date.now();
    await interceptor.intercept(context(info), next);
    const elapsed = Date.now() - start;

    // Sequential would be ~80ms; parallel should land near max(40,40) ≈ 40-70ms with jitter.
    expect(elapsed).toBeLessThan(80);
    expect(info.dataScope).toEqual({
      explicit: [1],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [7] },
    });
  });
});
