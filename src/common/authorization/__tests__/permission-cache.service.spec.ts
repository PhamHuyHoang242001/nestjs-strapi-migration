import { PermissionCacheService } from '../services/permission-cache.service';
import { PermissionQueryService } from '../services/permission-query.service';
import Redis from 'ioredis';

describe('PermissionCacheService', () => {
  const redis = {
    smembers: jest.fn(),
    sadd: jest.fn(),
    expire: jest.fn(),
    exists: jest.fn(),
    sismember: jest.fn(),
    scan: jest.fn(),
    del: jest.fn(),
  };
  const queryService = {
    getUserPermissions: jest.fn(),
    getAccessibleRecords: jest.fn(),
    getUserIdsByRole: jest.fn(),
  };
  let service: PermissionCacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PermissionCacheService(redis as unknown as Redis, queryService as unknown as PermissionQueryService);
  });

  it('loads permissions from cache when present', async () => {
    redis.smembers.mockResolvedValue(['report_view']);

    await expect(service.getPermissions(7)).resolves.toEqual(new Set(['report_view']));
    expect(queryService.getUserPermissions).not.toHaveBeenCalled();
  });

  it('warms permission cache on miss', async () => {
    redis.smembers.mockResolvedValue([]);
    queryService.getUserPermissions.mockResolvedValue(['report_view']);

    await expect(service.getPermissions(7)).resolves.toEqual(new Set(['report_view']));
    expect(redis.sadd).toHaveBeenCalledWith('perm:user:7:codes', 'report_view');
    expect(redis.expire).toHaveBeenCalledWith('perm:user:7:codes', 300);
  });

  it('uses sismember when permission cache exists', async () => {
    redis.exists.mockResolvedValue(1);
    redis.sismember.mockResolvedValue(1);

    await expect(service.hasPermission(7, 'report_view')).resolves.toBe(true);
    expect(queryService.getUserPermissions).not.toHaveBeenCalled();
  });

  it('caches accessible records with table and permission code key', async () => {
    redis.smembers.mockResolvedValue([]);
    queryService.getAccessibleRecords.mockResolvedValue([1, 2]);

    await expect(service.getAccessibleRecords(7, 'bi_hub_reports', 'report_view')).resolves.toEqual([1, 2]);
    expect(redis.sadd).toHaveBeenCalledWith('perm:user:7:da:bi_hub_reports:report_view', '1', '2');
    expect(redis.expire).toHaveBeenCalledWith('perm:user:7:da:bi_hub_reports:report_view', 120);
  });

  it('invalidates all users attached to a role', async () => {
    queryService.getUserIdsByRole.mockResolvedValue([7, 8]);
    redis.scan.mockResolvedValue(['0', ['perm:user:7:codes', 'perm:user:8:codes']]);

    await service.invalidateByRole(3);
    expect(redis.del).toHaveBeenCalled();
  });
});
