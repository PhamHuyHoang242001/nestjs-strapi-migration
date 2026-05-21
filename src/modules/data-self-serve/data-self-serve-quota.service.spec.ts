import { RedisAdapter } from '@common/infrastructure/redis.adapter';
import { BadRequestException } from '@nestjs/common';
import { DataSelfServeQuotaService } from './data-self-serve-quota.service';

jest.mock('@common/infrastructure/redis.adapter', () => ({
  RedisAdapter: { get: jest.fn(), set: jest.fn(), setNx: jest.fn(), del: jest.fn() },
}));

describe('DataSelfServeQuotaService', () => {
  const repo = { findOne: jest.fn() };
  const service = new DataSelfServeQuotaService(repo as any);

  beforeEach(() => {
    jest.clearAllMocks();
    repo.findOne.mockResolvedValue({ value: { user_daily_limit: 3 } });
    (RedisAdapter.setNx as jest.Mock).mockResolvedValue(true);
    (RedisAdapter.del as jest.Mock).mockResolvedValue(1);
  });

  it('returns configured daily limit when redis has no current value', async () => {
    (RedisAdapter.get as jest.Mock).mockResolvedValue(null);
    await expect(service.getRemaining(9, 'EDAPORTAL_TRACUULICHTRANO')).resolves.toEqual({
      user_remain: 3,
      user_daily_limit: 3,
    });
  });

  it('decrements existing remaining quota', async () => {
    (RedisAdapter.get as jest.Mock).mockResolvedValue('2');
    await service.consume(9, 'EDAPORTAL_TRACUULICHTRANO');
    expect(RedisAdapter.set).toHaveBeenCalledWith(expect.stringContaining(':9:'), '1', expect.any(Number));
  });

  it('blocks when quota is exhausted', async () => {
    (RedisAdapter.get as jest.Mock).mockResolvedValue('0');
    await expect(service.consume(9, 'EDAPORTAL_TRACUULICHTRANO')).rejects.toBeInstanceOf(BadRequestException);
  });
});
