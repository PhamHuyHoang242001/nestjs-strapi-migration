import { BiHubDiagnosticReportService } from './bi-hub-diagnostic-report.service';

// Covers the isUpdate/isDelete write-capability flags returned by findOne, with
// emphasis on the owner-scope (SO) rule: an owner-implied verb holder may only
// update/delete a report that resolves into their owned subtree.
describe('BiHubDiagnosticReportService.findOne write flags', () => {
  const REPORT_ID = 7;
  const EDIT_VERB = 'bh_diag_report_edit';
  const DELETE_VERB = 'bh_diag_report_delete';

  const buildService = (overrides?: {
    permissions?: Set<string>;
    impliedVerbs?: Set<string>;
    accessible?: number[];
    inOwnedScope?: boolean;
  }) => {
    // Report-fetch query builder — chainable, resolves a minimal report entity.
    const reportQb: any = {
      leftJoinAndSelect: jest.fn(() => reportQb),
      where: jest.fn(() => reportQb),
      andWhere: jest.fn(() => reportQb),
      getOne: jest.fn().mockResolvedValue({ id: REPORT_ID, name: 'Report', bi_hub_diagnostic_files: [] }),
    };
    const reportRepo = { createQueryBuilder: jest.fn(() => reportQb) };
    const historyRepo = {};
    const dataSource = {};

    const permissionCache = {
      getPermissions: jest.fn().mockResolvedValue(overrides?.permissions ?? new Set<string>()),
      getAccessibleRecords: jest.fn().mockResolvedValue(overrides?.accessible ?? []),
    };
    const ownerScope = {
      getUserImpliedVerbs: jest.fn().mockResolvedValue(overrides?.impliedVerbs ?? new Set<string>()),
      isInOwnedScope: jest.fn().mockResolvedValue(overrides?.inOwnedScope ?? false),
    };
    // PICs/supporters are decorative metadata here; return empty maps so findOne stays focused on flags.
    const picService = {
      getPicsByReportIds: jest.fn().mockResolvedValue(new Map()),
      getSupportersByReportIds: jest.fn().mockResolvedValue(new Map()),
    };

    const service = new BiHubDiagnosticReportService(
      reportRepo as any,
      historyRepo as any,
      dataSource as any,
      permissionCache as any,
      ownerScope as any,
      picService as any,
    );
    // scope=null → assertReportInScope admin-bypass; flags are derived from auth only.
    return { service, permissionCache, ownerScope };
  };

  it('grants both flags to super admin without touching permission services', async () => {
    const { service, permissionCache, ownerScope } = buildService();
    const res = await service.findOne(REPORT_ID, null, { userId: 1, isSuperAdmin: true });
    expect(res.isUpdate).toBe(true);
    expect(res.isDelete).toBe(true);
    expect(permissionCache.getPermissions).not.toHaveBeenCalled();
    expect(ownerScope.getUserImpliedVerbs).not.toHaveBeenCalled();
  });

  it('denies both flags when no viewer identity is provided', async () => {
    const { service } = buildService();
    const res = await service.findOne(REPORT_ID, null, { userId: null, isSuperAdmin: false });
    expect(res.isUpdate).toBe(false);
    expect(res.isDelete).toBe(false);
  });

  it('grants explicit verb holder when the record is in the data-access scope', async () => {
    const { service, ownerScope } = buildService({
      permissions: new Set([EDIT_VERB]),
      accessible: [REPORT_ID],
    });
    const res = await service.findOne(REPORT_ID, null, { userId: 2, isSuperAdmin: false });
    expect(res.isUpdate).toBe(true);
    expect(res.isDelete).toBe(false); // no delete verb
    expect(ownerScope.isInOwnedScope).not.toHaveBeenCalled(); // record-scope short-circuits
  });

  it('grants explicit verb holder via owned subtree when record not in explicit scope', async () => {
    const { service } = buildService({
      permissions: new Set([EDIT_VERB, DELETE_VERB]),
      accessible: [999],
      inOwnedScope: true,
    });
    const res = await service.findOne(REPORT_ID, null, { userId: 3, isSuperAdmin: false });
    expect(res.isUpdate).toBe(true);
    expect(res.isDelete).toBe(true);
  });

  it('denies explicit verb holder outside both explicit scope and owned subtree', async () => {
    const { service } = buildService({
      permissions: new Set([EDIT_VERB]),
      accessible: [999],
      inOwnedScope: false,
    });
    const res = await service.findOne(REPORT_ID, null, { userId: 4, isSuperAdmin: false });
    expect(res.isUpdate).toBe(false);
    expect(res.isDelete).toBe(false);
  });

  it('grants owner-implied (SO) holder only when report is in owned scope', async () => {
    const { service } = buildService({
      impliedVerbs: new Set([EDIT_VERB, DELETE_VERB]),
      inOwnedScope: true,
    });
    const res = await service.findOne(REPORT_ID, null, { userId: 5, isSuperAdmin: false });
    expect(res.isUpdate).toBe(true);
    expect(res.isDelete).toBe(true);
  });

  it('denies owner-implied (SO) holder when report is out of owned scope', async () => {
    const { service, ownerScope } = buildService({
      impliedVerbs: new Set([EDIT_VERB, DELETE_VERB]),
      inOwnedScope: false,
    });
    const res = await service.findOne(REPORT_ID, null, { userId: 6, isSuperAdmin: false });
    expect(res.isUpdate).toBe(false);
    expect(res.isDelete).toBe(false);
    expect(ownerScope.isInOwnedScope).toHaveBeenCalledWith(6, 'bi_hub_diagnostic_reports', REPORT_ID);
  });

  it('denies a viewer holding neither explicit nor implied write verbs', async () => {
    const { service } = buildService({ permissions: new Set(['bh_diag_report_view']) });
    const res = await service.findOne(REPORT_ID, null, { userId: 8, isSuperAdmin: false });
    expect(res.isUpdate).toBe(false);
    expect(res.isDelete).toBe(false);
  });
});
