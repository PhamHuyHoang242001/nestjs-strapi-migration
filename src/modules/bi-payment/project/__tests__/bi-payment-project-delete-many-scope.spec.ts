import { BiPaymentProjectService } from '../bi-payment-project.service';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import type { DataScope } from '@common/authorization/types/data-scope.types';

// deleteMany must filter requested ids against the caller's data scope before soft-remove.
// Out-of-scope ids are dropped (counted as error), never deleted. This is the defense-in-depth
// layer behind the route's @RequireDataAccess decorator — the service cannot trust the body.
describe('BiPaymentProjectService.deleteMany() — scope filtering', () => {
  // Fluent query-builder chain: select().where().andWhere().setParameter().getRawMany().
  // setParameter is called by applyDataScope when a non-null scope is passed.
  const buildFluentQb = (rawRows: any[]) => {
    const qb: any = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rawRows),
    };
    return qb;
  };

  const transaction = jest.fn();
  const dataSource = { transaction } as any;
  const creatorAccessGrant = {} as any;
  const ownerScope = {} as unknown as OwnerScopeResolverService;

  let findResult: any[] = [];
  const projectRepo: any = {
    createQueryBuilder: jest.fn(),
    find: jest.fn().mockImplementation(() => Promise.resolve(findResult)),
    softRemove: jest.fn().mockResolvedValue(undefined),
  };

  let service: BiPaymentProjectService;

  beforeEach(() => {
    jest.clearAllMocks();
    findResult = [];
    projectRepo.find.mockImplementation(() => Promise.resolve(findResult));
    service = new BiPaymentProjectService(projectRepo, dataSource, creatorAccessGrant, ownerScope);
  });

  it('admin (scope=null) deletes all found ids', async () => {
    const qb = buildFluentQb([{ id: 1 }, { id: 2 }]);
    projectRepo.createQueryBuilder.mockReturnValueOnce(qb);
    findResult = [{ id: 1 }, { id: 2 }];

    const res = await service.deleteMany([1, 2, 3], null);

    expect(res).toEqual({ success: 2, error: 1 });
    expect(projectRepo.softRemove).toHaveBeenCalledTimes(1);
  });

  it('scoped caller only deletes ids returned by the scope predicate', async () => {
    // scope predicate lets only id 2 through (id 1 is out of scope)
    const qb = buildFluentQb([{ id: 2 }]);
    projectRepo.createQueryBuilder.mockReturnValueOnce(qb);
    findResult = [{ id: 2 }];

    const scope: DataScope = { explicit: [2], ownedRoots: null };
    const res = await service.deleteMany([1, 2], scope);

    expect(res).toEqual({ success: 1, error: 1 });
    expect(projectRepo.softRemove).toHaveBeenCalledWith([{ id: 2 }]);
  });

  it('returns all-error when scope excludes every id', async () => {
    const qb = buildFluentQb([]);
    projectRepo.createQueryBuilder.mockReturnValueOnce(qb);

    const scope: DataScope = { explicit: [99], ownedRoots: null };
    const res = await service.deleteMany([1, 2], scope);

    expect(res).toEqual({ success: 0, error: 2 });
    expect(projectRepo.softRemove).not.toHaveBeenCalled();
  });

  it('returns zero-error on empty input', async () => {
    const res = await service.deleteMany([], null);
    expect(res).toEqual({ success: 0, error: 0 });
    expect(projectRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
});
