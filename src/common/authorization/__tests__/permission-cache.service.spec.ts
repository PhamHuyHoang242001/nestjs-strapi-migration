import { PermissionCacheService } from '../services/permission-cache.service';
import { PermissionQueryService } from '../services/permission-query.service';
import { RedisAdapter } from '@common/infrastructure/redis.adapter';

jest.mock('@common/infrastructure/redis.adapter');

describe('PermissionCacheService', () => {
  const queryService = {
    getUserPermissions: jest.fn(),
    getAccessibleRecords: jest.fn(),
    getUserIdsByRole: jest.fn(),
  };
  let service: PermissionCacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PermissionCacheService(queryService as unknown as PermissionQueryService);
  });

  it('loads permissions from cache when present', async () => {
    (RedisAdapter.get as jest.Mock).mockResolvedValue(JSON.stringify(['report_view']));

    await expect(service.getPermissions(7)).resolves.toEqual(new Set(['report_view']));
    expect(queryService.getUserPermissions).not.toHaveBeenCalled();
  });

  it('warms permission cache on miss', async () => {
    (RedisAdapter.get as jest.Mock).mockResolvedValue(null);
    queryService.getUserPermissions.mockResolvedValue(['report_view']);

    await expect(service.getPermissions(7)).resolves.toEqual(new Set(['report_view']));
    expect(RedisAdapter.set).toHaveBeenCalledWith('perm:user:7:codes', JSON.stringify(['report_view']), 300);
  });

  it('hasPermission delegates to getPermissions', async () => {
    (RedisAdapter.get as jest.Mock).mockResolvedValue(JSON.stringify(['report_view']));

    await expect(service.hasPermission(7, 'report_view')).resolves.toBe(true);
    await expect(service.hasPermission(7, 'report_edit')).resolves.toBe(false);
  });

  it('caches accessible records with table and permission code key', async () => {
    (RedisAdapter.get as jest.Mock).mockResolvedValue(null);
    queryService.getAccessibleRecords.mockResolvedValue([1, 2]);

    await expect(service.getAccessibleRecords(7, 'bi_hub_reports', 'report_view')).resolves.toEqual([1, 2]);
    expect(RedisAdapter.set).toHaveBeenCalledWith(
      'perm:user:7:da:bi_hub_reports:report_view',
      JSON.stringify(['1', '2']),
      120,
    );
  });

  it('invalidates all users attached to a role', async () => {
    queryService.getUserIdsByRole.mockResolvedValue([7, 8]);
    (RedisAdapter.unlinkKeyByPattern as jest.Mock).mockResolvedValue([]);

    await service.invalidateByRole(3);
    expect(RedisAdapter.unlinkKeyByPattern).toHaveBeenCalledTimes(2);
  });

  it('returns empty array for cached empty accessible records', async () => {
    (RedisAdapter.get as jest.Mock).mockResolvedValue(JSON.stringify([]));

    await expect(service.getAccessibleRecords(7, 'bi_hub_reports')).resolves.toEqual([]);
    expect(queryService.getAccessibleRecords).not.toHaveBeenCalled();
  });

  it('invalidateUser unlinks user pattern', async () => {
    (RedisAdapter.unlinkKeyByPattern as jest.Mock).mockResolvedValue([]);

    await service.invalidateUser(42);

    expect(RedisAdapter.unlinkKeyByPattern).toHaveBeenCalledWith('perm:user:42:*');
  });

  it('invalidateByTable unlinks table-scoped data-access pattern', async () => {
    (RedisAdapter.unlinkKeyByPattern as jest.Mock).mockResolvedValue([]);

    await service.invalidateByTable('bi_hub_reports');

    expect(RedisAdapter.unlinkKeyByPattern).toHaveBeenCalledWith('perm:user:*:da:bi_hub_reports*');
  });

  it('invalidateAll unlinks global perm pattern', async () => {
    (RedisAdapter.unlinkKeyByPattern as jest.Mock).mockResolvedValue([]);

    await service.invalidateAll();

    expect(RedisAdapter.unlinkKeyByPattern).toHaveBeenCalledWith('perm:user:*');
  });

  it('swallows Redis errors during invalidate (does not throw)', async () => {
    (RedisAdapter.unlinkKeyByPattern as jest.Mock).mockRejectedValueOnce(new Error('redis down'));

    await expect(service.invalidateUser(1)).resolves.toBeUndefined();
  });

  it('falls back to query when Redis read fails on getPermissions', async () => {
    (RedisAdapter.get as jest.Mock).mockRejectedValue(new Error('redis down'));
    queryService.getUserPermissions.mockResolvedValue(['report_view']);

    await expect(service.getPermissions(7)).resolves.toEqual(new Set(['report_view']));
  });
});
