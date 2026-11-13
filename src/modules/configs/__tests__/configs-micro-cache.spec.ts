import { MicroCacheService } from '@common/micro-cache';
import { ConfigsService } from '../configs.service';

function setup() {
  const row = { id: 1, key: 'k', value: { a: 1 }, created_by_user_id: null, updated_by_user_id: null };
  const qb = {
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[row], 1]),
  };
  const configRepo = {
    createQueryBuilder: jest.fn(() => qb),
    findOne: jest.fn().mockResolvedValue({ ...row }),
    save: jest.fn((c: object) => Promise.resolve(c)),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const userRepo = { find: jest.fn().mockResolvedValue([]) };
  const service = new ConfigsService(configRepo as never, userRepo as never, new MicroCacheService());
  return { service, configRepo, qb };
}

describe('ConfigsService micro-cache', () => {
  it('equivalent list requests share one DB query within the TTL', async () => {
    const { service, qb } = setup();
    await service.list({ page: 1, limit: 10 } as never);
    await service.list({ limit: 10, page: 1, keyword: '  ' } as never);
    expect(qb.getManyAndCount).toHaveBeenCalledTimes(1);
    await service.list({ page: 2, limit: 10 } as never);
    expect(qb.getManyAndCount).toHaveBeenCalledTimes(2);
  });

  it('detail is cached per id', async () => {
    const { service, configRepo } = setup();
    await service.findOne(1);
    await service.findOne(1);
    expect(configRepo.findOne).toHaveBeenCalledTimes(1);
  });

  it('a write clears the cache, so the next read hits the database', async () => {
    const { service, configRepo, qb } = setup();
    await service.list({} as never);
    await service.findOne(1);
    await service.update(1, { value: { a: 2 } } as never, 7);
    const detailLoads = configRepo.findOne.mock.calls.length;
    await service.findOne(1);
    expect(configRepo.findOne).toHaveBeenCalledTimes(detailLoads); // update already reloaded the detail
    await service.list({} as never);
    expect(qb.getManyAndCount).toHaveBeenCalledTimes(2);
    await service.remove(1, 7);
    await service.findOne(1);
    expect(configRepo.findOne).toHaveBeenCalledTimes(detailLoads + 2);
  });
});
