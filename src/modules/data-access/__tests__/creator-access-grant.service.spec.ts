import { CreatorAccessGrantService } from '../services/creator-access-grant.service';
import { PermissionCacheService } from '@common/authorization';
import { SCOPE_TYPE } from '@common/enums';

import { EntityManager } from 'typeorm';

// ── Mock factories ──────────────────────────────────────────────────────────

function createMockManager(
  overrides: {
    findOneResult?: any;
    findResult?: any[];
  } = {},
) {
  const manager = {
    findOne: jest.fn().mockResolvedValue(overrides.findOneResult ?? null),
    find: jest.fn().mockResolvedValue(overrides.findResult ?? []),
    create: jest.fn((_: any, data: any) => ({ ...data })),
    save: jest.fn(async (entity: any) => {
      if (Array.isArray(entity)) return entity.map((e, i) => ({ ...e, id: 100 + i }));
      return { ...entity, id: entity.id ?? 99 };
    }),
    insert: jest.fn(),
  } as unknown as EntityManager;

  return { manager };
}

function createService() {
  const mockPermissionCache = {
    invalidateUser: jest.fn().mockResolvedValue(undefined),
  } as unknown as PermissionCacheService;

  const service = new CreatorAccessGrantService(mockPermissionCache);

  return { service, mockPermissionCache };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('CreatorAccessGrantService.grantCreatorAccess()', () => {
  const baseParams = { tableName: 'bi_hub_diagnostic_reports', dataId: 42, userId: 7 };

  it('creates DataAccess + bulk-inserts UserDataAccess rows and returns true', async () => {
    const { service } = createService();
    const mockModule = { id: 5, table_name: 'bi_hub_diagnostic_reports', is_active: true };
    const mockPermissions = [
      { id: 10, action: 'read', module_id: 5, is_active: true },
      { id: 11, action: 'update', module_id: 5, is_active: true },
      { id: 12, action: 'delete', module_id: 5, is_active: true },
    ];
    const { manager } = createMockManager({ findOneResult: mockModule, findResult: mockPermissions });

    const result = await service.grantCreatorAccess(manager, baseParams);

    expect(result).toBe(true);

    // DataAccess record created via create+save
    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data_id: 42,
        module_id: 5,
        scope_type: SCOPE_TYPE.ALLOW,
      }),
    );
    expect(manager.save).toHaveBeenCalledTimes(1);

    // UserDataAccess rows bulk-inserted
    expect(manager.insert).toHaveBeenCalledWith(expect.anything(), [
      { user_id: 7, data_access_id: 99, permission_id: 10 },
      { user_id: 7, data_access_id: 99, permission_id: 11 },
      { user_id: 7, data_access_id: 99, permission_id: 12 },
    ]);
  });

  it('returns false and no-op when module not found', async () => {
    const { service } = createService();
    const { manager } = createMockManager({ findOneResult: null });

    const result = await service.grantCreatorAccess(manager, baseParams);

    expect(result).toBe(false);
    expect(manager.find).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('returns false and no-op when module has no RUD permissions', async () => {
    const { service } = createService();
    const mockModule = { id: 5, table_name: 'bi_hub_diagnostic_reports', is_active: true };
    const { manager } = createMockManager({ findOneResult: mockModule, findResult: [] });

    const result = await service.grantCreatorAccess(manager, baseParams);

    expect(result).toBe(false);
    expect(manager.find).toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('bulk-inserts only 2 rows when module has read+update only', async () => {
    const { service } = createService();
    const mockModule = { id: 3, table_name: 'ma_tool_workspaces', is_active: true };
    const mockPermissions = [
      { id: 20, action: 'read', module_id: 3, is_active: true },
      { id: 21, action: 'update', module_id: 3, is_active: true },
    ];
    const { manager } = createMockManager({ findOneResult: mockModule, findResult: mockPermissions });

    await service.grantCreatorAccess(manager, { tableName: 'ma_tool_workspaces', dataId: 10, userId: 5 });

    expect(manager.insert).toHaveBeenCalledWith(expect.anything(), [
      { user_id: 5, data_access_id: 99, permission_id: 20 },
      { user_id: 5, data_access_id: 99, permission_id: 21 },
    ]);
  });

  it('bulk-inserts only 1 row when module has read only', async () => {
    const { service } = createService();
    const mockModule = { id: 6, table_name: 'bi_hub_bicc_departments', is_active: true };
    const mockPermissions = [{ id: 30, action: 'read', module_id: 6, is_active: true }];
    const { manager } = createMockManager({ findOneResult: mockModule, findResult: mockPermissions });

    await service.grantCreatorAccess(manager, { tableName: 'bi_hub_bicc_departments', dataId: 1, userId: 2 });

    expect(manager.insert).toHaveBeenCalledWith(expect.anything(), [
      { user_id: 2, data_access_id: 99, permission_id: 30 },
    ]);
  });

  it('uses the provided EntityManager for all operations', async () => {
    const { service } = createService();
    const mockModule = { id: 5, table_name: 'bi_hub_diagnostic_reports', is_active: true };
    const mockPermissions = [{ id: 10, action: 'read', module_id: 5, is_active: true }];
    const { manager } = createMockManager({ findOneResult: mockModule, findResult: mockPermissions });

    await service.grantCreatorAccess(manager, baseParams);

    expect(manager.findOne).toHaveBeenCalled();
    expect(manager.find).toHaveBeenCalled();
    expect(manager.create).toHaveBeenCalledTimes(1); // Only DataAccess
    expect(manager.save).toHaveBeenCalledTimes(1); // Only DataAccess
    expect(manager.insert).toHaveBeenCalledTimes(1); // Bulk UserDataAccess
  });

  it('invalidateUserCache delegates to permissionCache', async () => {
    const { service, mockPermissionCache } = createService();
    await service.invalidateUserCache(7);
    expect(mockPermissionCache.invalidateUser).toHaveBeenCalledWith(7);
  });
});
