import { ForbiddenException } from '@nestjs/common';
import { BiHubDiagnosticReportWriteService } from './bi-hub-diagnostic-report-write.service';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import type { CreateDiagnosticReportDto } from './dto';

// Authorization gate for diagnostic-report create. Verifies the parent-scope check wired
// into service.create(): non-super_admin callers must clear canCreateUnderParent before any write.
describe('BiHubDiagnosticReportWriteService.create() — parent-scope authz', () => {
  const readService = { reportRepo: {} } as any;
  const transaction = jest.fn();
  const dataSource = { transaction } as any;
  const creatorAccessGrant = { grantCreatorAccess: jest.fn(), invalidateUserCache: jest.fn() } as any;
  // Standalone mock fn so assertions reference it directly (avoids unbound-method on the class type).
  const canCreateUnderParent = jest.fn();
  const ownerScope = { canCreateUnderParent } as unknown as OwnerScopeResolverService;

  const dto = {
    biccDepartment: 42,
    name: 'r',
    icon: 'i',
    isSensitive: false,
    scopes: 's',
  } as CreateDiagnosticReportDto;

  let service: BiHubDiagnosticReportWriteService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockResolvedValue({ id: 1 });
    service = new BiHubDiagnosticReportWriteService(readService, dataSource, creatorAccessGrant, ownerScope);
  });

  it('throws ForbiddenException and does NOT write when parent is out of scope', async () => {
    canCreateUnderParent.mockResolvedValueOnce(false);

    await expect(service.create(dto, 100, false)).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('proceeds to write when parent is in scope', async () => {
    canCreateUnderParent.mockResolvedValueOnce(true);

    const result = await service.create(dto, 100, false);

    expect(result).toEqual({ id: 1 });
    expect(canCreateUnderParent).toHaveBeenCalledWith(100, 'bi_hub_bicc_departments', 42, 'bh_diag_report_create');
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('bypasses the parent-scope check for super_admin', async () => {
    await service.create(dto, 100, true);

    expect(canCreateUnderParent).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
