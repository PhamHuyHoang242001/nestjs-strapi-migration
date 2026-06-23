import { BiccDepartmentService } from './bicc-department.service';

// Covers the bicc-level report capability flags (isCreate/isDownload/isDelete)
// returned by details(). A flag is true when THIS bicc carries a data-access grant
// for the report verb via a role/user the caller holds, OR the bicc is in the
// caller's owner (SO) scope. Both branches are folded by canCreateUnderParent over
// the bicc as the parent record — the unit boundary mocked here.
describe('BiccDepartmentService.details capability flags', () => {
  const BICC_ID = 7;
  const CREATE = 'bh_diag_report_create';
  const DOWNLOAD = 'bh_diag_report_download';
  const DELETE = 'bh_diag_report_delete';
  const BICC_TABLE = 'bi_hub_bicc_departments';

  // `grantedVerbs` models the set of verbs for which canCreateUnderParent resolves
  // true for this bicc (i.e. role/user grant on the bicc OR SO owned scope).
  const buildService = (grantedVerbs: Set<string> = new Set<string>()) => {
    // Department-fetch query builder — chainable, resolves a minimal entity.
    const deptQb: any = {
      leftJoinAndSelect: jest.fn(() => deptQb),
      where: jest.fn(() => deptQb),
      getOne: jest.fn().mockResolvedValue({ id: BICC_ID, name: 'Dept' }),
    };
    const biccDeptRepo = { createQueryBuilder: jest.fn(() => deptQb) };
    const dataSource = {};
    const creatorAccessGrant = {};

    const ownerScope = {
      canCreateUnderParent: jest
        .fn()
        .mockImplementation((_userId: number, _table: string, _id: number, verb: string) =>
          Promise.resolve(grantedVerbs.has(verb)),
        ),
    };

    const service = new BiccDepartmentService(
      biccDeptRepo as any,
      dataSource as any,
      creatorAccessGrant as any,
      ownerScope as any,
    );
    // scope=null → assertDeptInScope admin-bypass; flags are derived from auth only.
    return { service, ownerScope };
  };

  it('grants all flags to super admin without probing the bicc grant', async () => {
    const { service, ownerScope } = buildService();
    const res: any = await service.details(BICC_ID, null, { userId: 1, isSuperAdmin: true });
    expect(res.isCreate).toBe(true);
    expect(res.isDownload).toBe(true);
    expect(res.isDelete).toBe(true);
    expect(ownerScope.canCreateUnderParent).not.toHaveBeenCalled();
  });

  it('denies all flags when no viewer identity is provided', async () => {
    const { service, ownerScope } = buildService();
    const res: any = await service.details(BICC_ID, null, { userId: null, isSuperAdmin: false });
    expect(res.isCreate).toBe(false);
    expect(res.isDownload).toBe(false);
    expect(res.isDelete).toBe(false);
    expect(ownerScope.canCreateUnderParent).not.toHaveBeenCalled();
  });

  it('grants only the verb whose grant is bound to this bicc', async () => {
    const { service, ownerScope } = buildService(new Set([CREATE]));
    const res: any = await service.details(BICC_ID, null, { userId: 2, isSuperAdmin: false });
    expect(res.isCreate).toBe(true);
    expect(res.isDownload).toBe(false);
    expect(res.isDelete).toBe(false);
    // Each verb probed against this bicc as the parent record.
    expect(ownerScope.canCreateUnderParent).toHaveBeenCalledWith(2, BICC_TABLE, BICC_ID, CREATE);
    expect(ownerScope.canCreateUnderParent).toHaveBeenCalledWith(2, BICC_TABLE, BICC_ID, DOWNLOAD);
    expect(ownerScope.canCreateUnderParent).toHaveBeenCalledWith(2, BICC_TABLE, BICC_ID, DELETE);
  });

  it('grants all flags when all three verbs are bound to this bicc', async () => {
    const { service } = buildService(new Set([CREATE, DOWNLOAD, DELETE]));
    const res: any = await service.details(BICC_ID, null, { userId: 3, isSuperAdmin: false });
    expect(res.isCreate).toBe(true);
    expect(res.isDownload).toBe(true);
    expect(res.isDelete).toBe(true);
  });

  it('denies all flags when no verb grant is bound to this bicc', async () => {
    const { service } = buildService(new Set<string>());
    const res: any = await service.details(BICC_ID, null, { userId: 8, isSuperAdmin: false });
    expect(res.isCreate).toBe(false);
    expect(res.isDownload).toBe(false);
    expect(res.isDelete).toBe(false);
  });

  it('resolves a mixed grant set per verb independently', async () => {
    const { service } = buildService(new Set([DOWNLOAD, DELETE]));
    const res: any = await service.details(BICC_ID, null, { userId: 9, isSuperAdmin: false });
    expect(res.isCreate).toBe(false);
    expect(res.isDownload).toBe(true);
    expect(res.isDelete).toBe(true);
  });
});
