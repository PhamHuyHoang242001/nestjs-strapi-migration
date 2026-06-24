import { BiccDepartmentService } from './bicc-department.service';

// Covers the per-report-type capability blocks returned by details():
//   { diagnostic: {isCreate,isDownload,isDelete}, descriptive: {isCreate,isDownload,isDelete} }
// Within a type: a flag is true when THIS bicc carries a data-access grant for the verb
// (role/user) OR the bicc is in the caller's SO scope (both via canCreateUnderParent);
// download/delete are additionally true when the caller can act on ≥1 child report of that
// type under the bicc (hasAccessibleChildUnderParent). Unit boundary mocks the resolver.
describe('BiccDepartmentService.details capability flags', () => {
  const BICC_ID = 7;
  const BICC_TABLE = 'bi_hub_bicc_departments';

  // diagnostic verbs / table
  const DIAG_CREATE = 'bh_diag_report_create';
  const DIAG_DOWNLOAD = 'bh_diag_report_download';
  const DIAG_DELETE = 'bh_diag_report_delete';
  const DIAG_TABLE = 'bi_hub_diagnostic_reports';
  // descriptive verbs / table
  const DESC_CREATE = 'bh_report_create';
  const DESC_DOWNLOAD = 'bh_report_download';
  const DESC_DELETE = 'bh_report_delete';
  const DESC_TABLE = 'bi_hub_reports';

  // `grantedVerbs` = verbs for which canCreateUnderParent resolves true (bicc-bound or SO).
  // `childGrantedVerbs` = verbs for which the caller can act on ≥1 child report of the
  // relevant type under this bicc (per-report user/role exception).
  const buildService = (
    grantedVerbs: Set<string> = new Set<string>(),
    childGrantedVerbs: Set<string> = new Set<string>(),
  ) => {
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
      hasAccessibleChildUnderParent: jest
        .fn()
        .mockImplementation((_userId: number, _childTable: string, _id: number, verb: string) =>
          Promise.resolve(childGrantedVerbs.has(verb)),
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

  it('grants all flags for both types to super admin without probing grants', async () => {
    const { service, ownerScope } = buildService();
    const res: any = await service.details(BICC_ID, null, { userId: 1, isSuperAdmin: true });
    expect(res.diagnostic).toEqual({ isCreate: true, isDownload: true, isDelete: true });
    expect(res.descriptive).toEqual({ isCreate: true, isDownload: true, isDelete: true });
    expect(ownerScope.canCreateUnderParent).not.toHaveBeenCalled();
  });

  it('denies all flags for both types when no viewer identity is provided', async () => {
    const { service, ownerScope } = buildService();
    const res: any = await service.details(BICC_ID, null, { userId: null, isSuperAdmin: false });
    expect(res.diagnostic).toEqual({ isCreate: false, isDownload: false, isDelete: false });
    expect(res.descriptive).toEqual({ isCreate: false, isDownload: false, isDelete: false });
    expect(ownerScope.canCreateUnderParent).not.toHaveBeenCalled();
  });

  it('resolves each report type independently from its own verbs', async () => {
    // diagnostic create bound to bicc; descriptive download bound to bicc. Nothing else.
    const { service } = buildService(new Set([DIAG_CREATE, DESC_DOWNLOAD]));
    const res: any = await service.details(BICC_ID, null, { userId: 2, isSuperAdmin: false });
    expect(res.diagnostic).toEqual({ isCreate: true, isDownload: false, isDelete: false });
    expect(res.descriptive).toEqual({ isCreate: false, isDownload: true, isDelete: false });
  });

  it('probes both report tables for the child path (download/delete) per type', async () => {
    const { service, ownerScope } = buildService();
    await service.details(BICC_ID, null, { userId: 4, isSuperAdmin: false });
    // diagnostic download/delete probe the diagnostic child table
    expect(ownerScope.hasAccessibleChildUnderParent).toHaveBeenCalledWith(4, DIAG_TABLE, BICC_ID, DIAG_DOWNLOAD);
    expect(ownerScope.hasAccessibleChildUnderParent).toHaveBeenCalledWith(4, DIAG_TABLE, BICC_ID, DIAG_DELETE);
    // descriptive download/delete probe the descriptive child table
    expect(ownerScope.hasAccessibleChildUnderParent).toHaveBeenCalledWith(4, DESC_TABLE, BICC_ID, DESC_DOWNLOAD);
    expect(ownerScope.hasAccessibleChildUnderParent).toHaveBeenCalledWith(4, DESC_TABLE, BICC_ID, DESC_DELETE);
    // create (either type) must NEVER consult the child path
    expect(ownerScope.hasAccessibleChildUnderParent).not.toHaveBeenCalledWith(4, expect.anything(), BICC_ID, DIAG_CREATE);
    expect(ownerScope.hasAccessibleChildUnderParent).not.toHaveBeenCalledWith(4, expect.anything(), BICC_ID, DESC_CREATE);
  });

  it('lights up download/delete from a child exception while create stays parent-bound (both types)', async () => {
    const { service } = buildService(
      new Set<string>(),
      new Set([DIAG_DOWNLOAD, DIAG_DELETE, DESC_DOWNLOAD, DESC_DELETE]),
    );
    const res: any = await service.details(BICC_ID, null, { userId: 11, isSuperAdmin: false });
    expect(res.diagnostic).toEqual({ isCreate: false, isDownload: true, isDelete: true });
    expect(res.descriptive).toEqual({ isCreate: false, isDownload: true, isDelete: true });
  });

  it('combines a bicc-bound diagnostic create with a descriptive child-exception download', async () => {
    const { service } = buildService(new Set([DIAG_CREATE]), new Set([DESC_DOWNLOAD]));
    const res: any = await service.details(BICC_ID, null, { userId: 12, isSuperAdmin: false });
    expect(res.diagnostic).toEqual({ isCreate: true, isDownload: false, isDelete: false });
    expect(res.descriptive).toEqual({ isCreate: false, isDownload: true, isDelete: false });
  });

  it('denies all flags for both types when nothing is granted', async () => {
    const { service, ownerScope } = buildService(new Set<string>(), new Set<string>());
    const res: any = await service.details(BICC_ID, null, { userId: 8, isSuperAdmin: false });
    expect(res.diagnostic).toEqual({ isCreate: false, isDownload: false, isDelete: false });
    expect(res.descriptive).toEqual({ isCreate: false, isDownload: false, isDelete: false });
    // both create verbs probed against this bicc as the parent record
    expect(ownerScope.canCreateUnderParent).toHaveBeenCalledWith(8, BICC_TABLE, BICC_ID, DIAG_CREATE);
    expect(ownerScope.canCreateUnderParent).toHaveBeenCalledWith(8, BICC_TABLE, BICC_ID, DESC_CREATE);
  });
});
