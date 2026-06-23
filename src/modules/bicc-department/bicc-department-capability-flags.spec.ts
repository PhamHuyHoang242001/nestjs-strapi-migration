import { BiccDepartmentService } from './bicc-department.service';

// Covers the bicc-level report capability flags (isCreate/isDownload/isDelete)
// returned by details(). Rule is coarser than the per-record findOne flags:
// an explicit verb holder (from role/user) gets the flag regardless of which
// records they can touch; an owner-implied (SO) holder gets it only when this
// bicc resolves into their owned scope.
describe('BiccDepartmentService.details capability flags', () => {
  const BICC_ID = 7;
  const CREATE = 'bh_diag_report_create';
  const DOWNLOAD = 'bh_diag_report_download';
  const DELETE = 'bh_diag_report_delete';
  const BICC_TABLE = 'bi_hub_bicc_departments';

  const buildService = (overrides?: {
    permissions?: Set<string>;
    impliedVerbs?: Set<string>;
    inOwnedScope?: boolean;
  }) => {
    // Department-fetch query builder — chainable, resolves a minimal entity.
    const deptQb: any = {
      leftJoinAndSelect: jest.fn(() => deptQb),
      where: jest.fn(() => deptQb),
      getOne: jest.fn().mockResolvedValue({ id: BICC_ID, name: 'Dept' }),
    };
    const biccDeptRepo = { createQueryBuilder: jest.fn(() => deptQb) };
    const dataSource = {};
    const creatorAccessGrant = {};

    const permissionCache = {
      getPermissions: jest.fn().mockResolvedValue(overrides?.permissions ?? new Set<string>()),
    };
    const ownerScope = {
      getUserImpliedVerbs: jest.fn().mockResolvedValue(overrides?.impliedVerbs ?? new Set<string>()),
      isInOwnedScope: jest.fn().mockResolvedValue(overrides?.inOwnedScope ?? false),
    };

    const service = new BiccDepartmentService(
      biccDeptRepo as any,
      dataSource as any,
      creatorAccessGrant as any,
      permissionCache as any,
      ownerScope as any,
    );
    // scope=null → assertDeptInScope admin-bypass; flags are derived from auth only.
    return { service, permissionCache, ownerScope };
  };

  it('grants all flags to super admin without touching permission services', async () => {
    const { service, permissionCache, ownerScope } = buildService();
    const res: any = await service.details(BICC_ID, null, { userId: 1, isSuperAdmin: true });
    expect(res.isCreate).toBe(true);
    expect(res.isDownload).toBe(true);
    expect(res.isDelete).toBe(true);
    expect(permissionCache.getPermissions).not.toHaveBeenCalled();
    expect(ownerScope.getUserImpliedVerbs).not.toHaveBeenCalled();
  });

  it('denies all flags when no viewer identity is provided', async () => {
    const { service } = buildService();
    const res: any = await service.details(BICC_ID, null, { userId: null, isSuperAdmin: false });
    expect(res.isCreate).toBe(false);
    expect(res.isDownload).toBe(false);
    expect(res.isDelete).toBe(false);
  });

  it('grants explicit verb holder by verb presence alone (no owned-scope probe)', async () => {
    const { service, ownerScope } = buildService({ permissions: new Set([CREATE]) });
    const res: any = await service.details(BICC_ID, null, { userId: 2, isSuperAdmin: false });
    expect(res.isCreate).toBe(true);
    expect(res.isDownload).toBe(false);
    expect(res.isDelete).toBe(false);
    expect(ownerScope.isInOwnedScope).not.toHaveBeenCalled();
  });

  it('grants all flags to an explicit holder of all three verbs without an owned-scope probe', async () => {
    const { service, ownerScope } = buildService({ permissions: new Set([CREATE, DOWNLOAD, DELETE]) });
    const res: any = await service.details(BICC_ID, null, { userId: 3, isSuperAdmin: false });
    expect(res.isCreate).toBe(true);
    expect(res.isDownload).toBe(true);
    expect(res.isDelete).toBe(true);
    expect(ownerScope.isInOwnedScope).not.toHaveBeenCalled();
  });

  it('grants owner-implied (SO) holder only when bicc is in owned scope', async () => {
    const { service, ownerScope } = buildService({
      impliedVerbs: new Set([CREATE, DOWNLOAD, DELETE]),
      inOwnedScope: true,
    });
    const res: any = await service.details(BICC_ID, null, { userId: 5, isSuperAdmin: false });
    expect(res.isCreate).toBe(true);
    expect(res.isDownload).toBe(true);
    expect(res.isDelete).toBe(true);
    expect(ownerScope.isInOwnedScope).toHaveBeenCalledWith(5, BICC_TABLE, BICC_ID);
  });

  it('denies owner-implied (SO) holder when bicc is out of owned scope', async () => {
    const { service } = buildService({
      impliedVerbs: new Set([CREATE, DOWNLOAD, DELETE]),
      inOwnedScope: false,
    });
    const res: any = await service.details(BICC_ID, null, { userId: 6, isSuperAdmin: false });
    expect(res.isCreate).toBe(false);
    expect(res.isDownload).toBe(false);
    expect(res.isDelete).toBe(false);
  });

  it('denies a viewer holding neither explicit nor implied report verbs', async () => {
    const { service } = buildService({ permissions: new Set(['bh_bicc_dept_view']) });
    const res: any = await service.details(BICC_ID, null, { userId: 8, isSuperAdmin: false });
    expect(res.isCreate).toBe(false);
    expect(res.isDownload).toBe(false);
    expect(res.isDelete).toBe(false);
  });

  it('mixes explicit and implied verbs — explicit needs no probe, implied honored when owned', async () => {
    const { service, ownerScope } = buildService({
      permissions: new Set([CREATE]),
      impliedVerbs: new Set([DOWNLOAD, DELETE]),
      inOwnedScope: true,
    });
    const res: any = await service.details(BICC_ID, null, { userId: 9, isSuperAdmin: false });
    expect(res.isCreate).toBe(true);
    expect(res.isDownload).toBe(true);
    expect(res.isDelete).toBe(true);
    // owned-scope probe invoked at most once even across two implied verbs
    expect(ownerScope.isInOwnedScope).toHaveBeenCalledTimes(1);
  });
});
