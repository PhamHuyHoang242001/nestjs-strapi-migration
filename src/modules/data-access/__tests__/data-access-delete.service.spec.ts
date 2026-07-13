import { DataAccessService } from '../data-access.service';
import { DataAccessRepository } from '../repository/data-access.repository';
import { HierarchyValidationService } from '../hierarchy-validation.service';
import { ChangeHistoryLogger } from '@modules/change-history/change-history-logger.service';
import { PermissionCacheService } from '@common/authorization';
import { DataSource, Repository } from 'typeorm';
import { SCOPE_TYPE } from '@common/enums';
import { NotFoundException } from '@nestjs/common';

// ── Shared mock factory ─────────────────────────────────────────────────────

const sampleRecord = {
  id: 1,
  data_id: 42,
  module_id: 5,
  scope_type: SCOPE_TYPE.ALLOW,
  module: { id: 5, table_name: 'bi_hub_reports' },
  role_data_access: [{ role_id: 3, role: { name: 'Manager' } }],
  user_data_access: [
    { user_id: 10, permission_id: 1, user: { username: 'john', email: 'john@test.com' }, permission: { name: 'View' } },
    { user_id: 10, permission_id: 2, user: { username: 'john', email: 'john@test.com' }, permission: { name: 'Edit' } },
  ],
};

function createService(
  overrides: {
    findOne?: jest.Mock;
    transaction?: jest.Mock;
  } = {},
) {
  const managerCalls: Record<string, any[]> = { softDelete: [] };
  const mockTransaction =
    overrides.transaction ??
    jest.fn(async (cb: any) => {
      const manager = {
        softDelete: jest.fn((...args: any[]) => {
          managerCalls.softDelete.push(args);
        }),
      };
      return cb(manager);
    });

  const mockDataSource = {
    query: jest.fn().mockResolvedValue([]),
    transaction: mockTransaction,
  } as unknown as DataSource;

  const mockDataAccessRepo = {
    findOne: overrides.findOne ?? jest.fn().mockResolvedValue({ ...sampleRecord }),
    softDelete: jest.fn(),
  } as unknown as DataAccessRepository;

  const mockHierarchyValidation = { enforce: jest.fn() } as unknown as HierarchyValidationService;
  const mockHistoryLogger = { log: jest.fn().mockReturnValue(Promise.resolve()) } as unknown as ChangeHistoryLogger;
  const mockPermissionCache = {
    invalidateByTable: jest.fn().mockReturnValue(Promise.resolve()),
    invalidateUser: jest.fn().mockReturnValue(Promise.resolve()),
  } as unknown as PermissionCacheService;
  const mockRecordPath = { buildPath: jest.fn().mockResolvedValue("ID: 0") } as unknown as import("../services/record-path.service").RecordPathService;

  const mockModuleRepo = {} as unknown as Repository<any>;
  const mockRoleDataAccessRepo = { insert: jest.fn(), softDelete: jest.fn() } as unknown as Repository<any>;
  const mockUserDataAccessRepo = { insert: jest.fn(), softDelete: jest.fn() } as unknown as Repository<any>;

  const service = new DataAccessService(
    mockDataAccessRepo,
    mockDataSource,
    mockHierarchyValidation,
    mockHistoryLogger,
    mockPermissionCache,
    mockRecordPath,
    mockModuleRepo,
    mockRoleDataAccessRepo,
    mockUserDataAccessRepo,
  );

  return {
    service,
    mockDataAccessRepo,
    mockHistoryLogger,
    mockPermissionCache,
    mockRecordPath,
    mockTransaction,
    managerCalls,
    mockRoleDataAccessRepo,
    mockUserDataAccessRepo,
  };
}

// ── delete() ────────────────────────────────────────────────────────────────

describe('DataAccessService.delete()', () => {
  it('throws NotFoundException when record not found', async () => {
    const { service } = createService({ findOne: jest.fn().mockResolvedValue(null) });
    await expect(service.delete(999)).rejects.toThrow(NotFoundException);
  });

  it('soft-deletes junctions and rule inside transaction', async () => {
    const { service, mockTransaction } = createService();
    await service.delete(1);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns { id } on success', async () => {
    const { service } = createService();
    const result = await service.delete(1);
    expect(result).toEqual({ id: 1 });
  });

  it('logs deletion history', async () => {
    const { service, mockHistoryLogger } = createService();
    await service.delete(1, 'admin');
    expect(mockHistoryLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action_type: 'delete',
        performed_by: 'admin',
        new_value: null,
      }),
    );
  });

  it('invalidates table and user caches', async () => {
    const { service, mockPermissionCache } = createService();
    await service.delete(1);
    expect(mockPermissionCache.invalidateByTable).toHaveBeenCalledWith('bi_hub_reports');
    expect(mockPermissionCache.invalidateUser).toHaveBeenCalledWith(10);
  });
});

// ── removeLink() ────────────────────────────────────────────────────────────

describe('DataAccessService.removeLink()', () => {
  it('throws NotFoundException when rule not found', async () => {
    const { service } = createService({ findOne: jest.fn().mockResolvedValue(null) });
    await expect(service.removeLink(999, 'role', 3)).rejects.toThrow(NotFoundException);
  });

  it('soft-deletes the role junction row', async () => {
    const { service, mockRoleDataAccessRepo } = createService();
    await service.removeLink(1, 'role', 3);
    expect(mockRoleDataAccessRepo.softDelete).toHaveBeenCalledWith({ data_access_id: 1, role_id: 3 });
  });

  it('soft-deletes the user junction row', async () => {
    const { service, mockUserDataAccessRepo } = createService();
    await service.removeLink(1, 'user', 10);
    expect(mockUserDataAccessRepo.softDelete).toHaveBeenCalledWith({ data_access_id: 1, user_id: 10 });
  });

  it('soft-deletes entire rule when no subjects remain after role removal', async () => {
    // Record with only 1 role and no users
    const record = {
      ...sampleRecord,
      role_data_access: [{ role_id: 3, role: { name: 'Manager' } }],
      user_data_access: [],
    };
    const { service, mockDataAccessRepo } = createService({ findOne: jest.fn().mockResolvedValue(record) });
    await service.removeLink(1, 'role', 3);
    expect(mockDataAccessRepo.softDelete).toHaveBeenCalledWith({ id: 1 });
  });

  it('keeps rule when other subjects remain', async () => {
    // Record with 2 roles
    const record = {
      ...sampleRecord,
      role_data_access: [
        { role_id: 3, role: { name: 'Manager' } },
        { role_id: 7, role: { name: 'Viewer' } },
      ],
      user_data_access: [],
    };
    const { service, mockDataAccessRepo } = createService({ findOne: jest.fn().mockResolvedValue(record) });
    await service.removeLink(1, 'role', 3);
    expect(mockDataAccessRepo.softDelete).not.toHaveBeenCalled();
  });

  it('counts distinct user_ids when checking remaining users', async () => {
    // User 10 has 2 permission rows but is 1 distinct user — removing role 3 should keep rule
    const record = {
      ...sampleRecord,
      role_data_access: [{ role_id: 3, role: { name: 'Manager' } }],
      user_data_access: [
        { user_id: 10, permission_id: 1, user: { username: 'john' }, permission: { name: 'View' } },
        { user_id: 10, permission_id: 2, user: { username: 'john' }, permission: { name: 'Edit' } },
      ],
    };
    const { service, mockDataAccessRepo } = createService({ findOne: jest.fn().mockResolvedValue(record) });
    await service.removeLink(1, 'role', 3);
    // user 10 still remains → rule should NOT be deleted
    expect(mockDataAccessRepo.softDelete).not.toHaveBeenCalled();
  });

  it('returns removed subject info', async () => {
    const { service } = createService();
    const result = await service.removeLink(1, 'role', 3, 'admin');
    expect(result).toEqual({ rule_id: 1, removed: { subject_type: 'role', subject_id: 3 } });
  });

  it('invalidates user cache when removing user link', async () => {
    const { service, mockPermissionCache } = createService();
    await service.removeLink(1, 'user', 10);
    expect(mockPermissionCache.invalidateUser).toHaveBeenCalledWith(10);
  });

  it('does NOT invalidate user cache when removing role link', async () => {
    const { service, mockPermissionCache } = createService();
    await service.removeLink(1, 'role', 3);
    expect(mockPermissionCache.invalidateUser).not.toHaveBeenCalled();
  });
});
