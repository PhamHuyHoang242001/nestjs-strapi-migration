import { ForbiddenException } from '@nestjs/common';
import { BiPaymentProgramService } from '../bi-payment-program.service';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import type { CreateBiPaymentProgramDto } from '../dto';

// Authorization gate for program create. Verifies the parent-scope check wired into
// service.create(): non-super_admin callers must clear canCreateUnderParent on the parent
// bi_payment_projects (via projectId) before any write reaches the transaction.
describe('BiPaymentProgramService.create() — parent-scope authz', () => {
  const programRepo = {} as any;
  const transaction = jest.fn();
  const dataSource = { transaction } as any;
  const creatorAccessGrant = { grantCreatorAccess: jest.fn(), invalidateUserCache: jest.fn() } as any;
  const canCreateUnderParent = jest.fn();
  const ownerScope = { canCreateUnderParent } as unknown as OwnerScopeResolverService;

  const dto = {
    projectId: 7,
    name: 'program-1',
    code: 'PRG1',
  } as unknown as CreateBiPaymentProgramDto;

  let service: BiPaymentProgramService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockResolvedValue({ id: 1 });
    service = new BiPaymentProgramService(programRepo, dataSource, creatorAccessGrant, ownerScope);
  });

  it('throws ForbiddenException and does NOT write when parent project is out of scope', async () => {
    canCreateUnderParent.mockResolvedValueOnce(false);

    await expect(service.create(dto, 100, false)).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('proceeds to write when parent project is in scope', async () => {
    canCreateUnderParent.mockResolvedValueOnce(true);

    const result = await service.create(dto, 100, false);

    expect(result).toEqual({ id: 1 });
    expect(canCreateUnderParent).toHaveBeenCalledWith(100, 'bi_payment_projects', 7, 'bp_program_create');
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('bypasses the parent-scope check for super_admin', async () => {
    await service.create(dto, 100, true);

    expect(canCreateUnderParent).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
