import { ForbiddenException } from '@nestjs/common';
import { DiagnosticTransformFileResolver } from './diagnostic-transform-file.resolver';
import { TransformFileModel } from '@common/transform-file';

describe('DiagnosticTransformFileResolver', () => {
  const createResolver = () => {
    const reportRepo = {
      findOne: jest.fn(),
      update: jest.fn(),
    };
    const historyRepo = {
      findOne: jest.fn(),
    };
    const logRepo = {
      create: jest.fn((data) => data),
      save: jest.fn(),
    };
    const permissionCache = {
      hasPermission: jest.fn().mockResolvedValue(true),
      getAccessibleRecords: jest.fn().mockResolvedValue([7, 8, 9]),
    };
    const ownerScope = {
      getUserImpliedVerbs: jest.fn().mockResolvedValue(new Set<string>()),
      getOwnedRoots: jest.fn().mockResolvedValue([]),
      isInOwnedScope: jest.fn().mockResolvedValue(false),
    };

    return {
      resolver: new DiagnosticTransformFileResolver(
        reportRepo as any,
        historyRepo as any,
        logRepo as any,
        permissionCache as any,
        ownerScope as any,
      ),
      reportRepo,
      historyRepo,
      logRepo,
      permissionCache,
      ownerScope,
    };
  };

  it('supports diagnostic transform file models only', () => {
    const { resolver } = createResolver();

    expect(resolver.supports(TransformFileModel.BI_DIAGNOSTIC_REPORT)).toBe(true);
    expect(resolver.supports(TransformFileModel.BI_DIAGNOSTIC_HISTORY_REPORT)).toBe(true);
  });

  // ── authorize() tests ──────────────────────────────────────────

  it('authorize() throws ForbiddenException when user lacks permission', async () => {
    const { resolver, permissionCache } = createResolver();
    permissionCache.hasPermission.mockResolvedValue(false);

    await expect(
      resolver.authorize({
        id: 7,
        model: TransformFileModel.BI_DIAGNOSTIC_REPORT,
        info: { user: { id: 1 }, client: 'user' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('authorize() throws ForbiddenException when user id is missing', async () => {
    const { resolver } = createResolver();

    await expect(
      resolver.authorize({
        id: 7,
        model: TransformFileModel.BI_DIAGNOSTIC_REPORT,
        info: { user: {}, client: 'user' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('authorize() builds dataScope.explicit for authorized user', async () => {
    const { resolver, permissionCache } = createResolver();
    permissionCache.hasPermission.mockResolvedValue(true);
    permissionCache.getAccessibleRecords.mockResolvedValue([7, 8]);

    const request: any = {
      id: 7,
      model: TransformFileModel.BI_DIAGNOSTIC_REPORT,
      info: { user: { id: 1 }, client: 'user' },
    };
    await resolver.authorize(request);

    expect(request.dataScope).toEqual({ explicit: [7, 8], ownedRoots: null });
  });

  it('authorize() resolves verb via owner-implied path for an SO (no explicit verb)', async () => {
    const { resolver, permissionCache, ownerScope } = createResolver();
    permissionCache.hasPermission.mockResolvedValue(false);
    ownerScope.getUserImpliedVerbs.mockResolvedValue(new Set(['bh_diag_report_view']));
    ownerScope.getOwnedRoots.mockResolvedValue([5]);

    const request: any = {
      id: 7,
      model: TransformFileModel.BI_DIAGNOSTIC_REPORT,
      info: { user: { id: 1 }, client: 'user' },
    };
    await resolver.authorize(request);

    // Owner-only path: explicit branch suppressed, owner branch carries the roots.
    expect(permissionCache.getAccessibleRecords).not.toHaveBeenCalled();
    expect(request.dataScope).toEqual({
      explicit: [],
      ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [5] },
    });
  });

  it('authorize() throws when neither explicit nor implied verb is held', async () => {
    const { resolver, permissionCache, ownerScope } = createResolver();
    permissionCache.hasPermission.mockResolvedValue(false);
    ownerScope.getUserImpliedVerbs.mockResolvedValue(new Set<string>());

    await expect(
      resolver.authorize({
        id: 7,
        model: TransformFileModel.BI_DIAGNOSTIC_REPORT,
        info: { user: { id: 1 }, client: 'user' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ── transform() tests ─────────────────────────────────────────

  it('blocks report transform when dataScope.explicit excludes report', async () => {
    const { resolver, reportRepo } = createResolver();

    await expect(
      resolver.transform({
        id: 7,
        model: TransformFileModel.BI_DIAGNOSTIC_REPORT,
        info: { user: { id: 1 }, client: 'user' },
        dataScope: { explicit: [8], ownedRoots: null },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(reportRepo.findOne).not.toHaveBeenCalled();
  });

  it('allows owned report transform via owner branch when explicit excludes it (SO case)', async () => {
    const { resolver, reportRepo, ownerScope } = createResolver();
    ownerScope.isInOwnedScope.mockResolvedValue(true);
    reportRepo.findOne.mockResolvedValue({
      id: 7,
      name: 'Diagnostic report',
      code: 'BICC_7',
      bi_hub_diagnostic_files: [{ file_url: '/uploads/report.pdf', type: 'pdf', lastest_version: true }],
    });

    const result = await resolver.transform({
      id: 7,
      model: TransformFileModel.BI_DIAGNOSTIC_REPORT,
      info: { user: { id: 1 }, client: 'user' },
      // owner-only path: report 7 not in explicit, but owned via root dept 5
      dataScope: { explicit: [], ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [5] } },
    });

    expect(result).toEqual({ url: '/uploads/report.pdf', type: 'pdf' });
    expect(ownerScope.isInOwnedScope).toHaveBeenCalledWith(1, 'bi_hub_diagnostic_reports', 7);
  });

  it('blocks transform when report is neither explicit nor owned', async () => {
    const { resolver, reportRepo, ownerScope } = createResolver();
    ownerScope.isInOwnedScope.mockResolvedValue(false);

    await expect(
      resolver.transform({
        id: 7,
        model: TransformFileModel.BI_DIAGNOSTIC_REPORT,
        info: { user: { id: 1 }, client: 'user' },
        dataScope: { explicit: [8], ownedRoots: { rootTable: 'bi_hub_bicc_departments', rootIds: [5] } },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(reportRepo.findOne).not.toHaveBeenCalled();
  });

  it('returns normal file URL and increments report view', async () => {
    const { resolver, reportRepo, logRepo } = createResolver();
    reportRepo.findOne.mockResolvedValue({
      id: 7,
      name: 'Diagnostic report',
      code: 'BICC_7',
      bi_hub_diagnostic_files: [{ file_url: '/uploads/report.pdf', type: 'pdf', lastest_version: true }],
    });

    const result = await resolver.transform({
      id: 7,
      model: TransformFileModel.BI_DIAGNOSTIC_REPORT,
      info: { user: { id: 1, email: 'user@example.com' }, client: 'user' },
      dataScope: { explicit: [7], ownedRoots: null },
    });

    expect(result).toEqual({ url: '/uploads/report.pdf', type: 'pdf' });
    expect(reportRepo.update).toHaveBeenCalledWith(7, { total_view: expect.any(Function) });
    expect(logRepo.save).toHaveBeenCalled();
  });
});
