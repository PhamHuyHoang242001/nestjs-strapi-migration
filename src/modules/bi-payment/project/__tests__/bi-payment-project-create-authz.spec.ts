import { ForbiddenException } from '@nestjs/common';
import { BiPaymentProjectService } from '../bi-payment-project.service';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import type { CreateBiPaymentProjectDto } from '../dto';

// Authorization gate for project create. Verifies the parent-scope check wired into
// service.create(): non-super_admin callers must clear canCreateUnderParent on the parent
// bi_hub_bicc_departments (via biccDepartmentId) before any write reaches the transaction.
describe('BiPaymentProjectService.create() — parent-scope authz', () => {
  const projectRepo = {
    createQueryBuilder: jest.fn(),
  } as any;
  const transaction = jest.fn();
  const dataSource = { transaction } as any;
  const creatorAccessGrant = { grantCreatorAccess: jest.fn(), invalidateUserCache: jest.fn() } as any;
  const canCreateUnderParent = jest.fn();
  const ownerScope = { canCreateUnderParent } as unknown as OwnerScopeResolverService;

  const dto = {
    biccDepartmentId: 42,
    projectCode: 'P1',
    projectName: 'n',
    projectType: 'type_a' as any,
    expectedStartingDate: '2026-01-01',
    expectedEndingDate: '2026-12-31',
    projectStatus: 'active' as any,
    s3Id: 1,
    categoryIds: [1],
    requester: 'r',
    workSteps: [],
  } as unknown as CreateBiPaymentProjectDto;

  let service: BiPaymentProjectService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockResolvedValue({ id: 1 });
    service = new BiPaymentProjectService(projectRepo, dataSource, creatorAccessGrant, ownerScope);
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
    expect(canCreateUnderParent).toHaveBeenCalledWith(100, 'bi_hub_bicc_departments', 42, 'bp_project_create');
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('bypasses the parent-scope check for super_admin', async () => {
    await service.create(dto, 100, true);

    expect(canCreateUnderParent).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
