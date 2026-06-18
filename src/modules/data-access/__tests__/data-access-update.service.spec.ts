import { DataAccessService } from '../data-access.service';
import { DataAccessRepository } from '../repository/data-access.repository';
import { HierarchyValidationService } from '../hierarchy-validation.service';
import { ChangeHistoryLogger } from '@modules/change-history/change-history-logger.service';
import { PermissionCacheService } from '@common/authorization';
import { DataSource, Repository } from 'typeorm';
import { SCOPE_TYPE } from '@common/enums';
import { UpdateDataAccessDto } from '../dto/update-data-access.dto';
import { BadRequestException, NotFoundException } from '@nestjs/common';

// ── Shared mock factory ─────────────────────────────────────────────────────

const sampleRecord = {
  id: 1,
  data_id: 42,
  module_id: 5,
  scope_type: SCOPE_TYPE.ALLOW,
  start_date: null,
  end_date: null,
  module: { id: 5, table_name: 'bi_hub_reports', name: 'Reports' },
  role_data_access: [{ role_id: 3, role: { name: 'Manager' } }],
  user_data_access: [
    { user_id: 10, permission_id: 1, user: { username: 'john', email: 'john@test.com' }, permission: { name: 'View' } },
  ],
};

function createService(
  overrides: {
    findOne?: jest.Mock;
    transaction?: jest.Mock;
    query?: jest.Mock;
    hierarchyEnforce?: jest.Mock;
  } = {},
) {
  const mockTransaction =
    overrides.transaction ??
    jest.fn(async (cb: any) => {
      const manager = { save: jest.fn(), delete: jest.fn(), insert: jest.fn() };
      return cb(manager);
    });

  const mockDataSource = {
    query: overrides.query ?? jest.fn().mockResolvedValue([]),
    transaction: mockTransaction,
  } as unknown as DataSource;

  const mockDataAccessRepo = {
    findOne: overrides.findOne ?? jest.fn().mockResolvedValue({ ...sampleRecord }),
    softDelete: jest.fn(),
  } as unknown as DataAccessRepository;

  const mockHierarchyValidation = {
    enforce: overrides.hierarchyEnforce ?? jest.fn(),
  } as unknown as HierarchyValidationService;

  const mockHistoryLogger = { log: jest.fn().mockReturnValue(Promise.resolve()) } as unknown as ChangeHistoryLogger;
  const mockPermissionCache = {
    invalidateByTable: jest.fn().mockReturnValue(Promise.resolve()),
    invalidateUser: jest.fn().mockReturnValue(Promise.resolve()),
  } as unknown as PermissionCacheService;

  const mockModuleRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 5, table_name: 'bi_hub_reports' }),
  } as unknown as Repository<any>;

  const mockRoleDataAccessRepo = { insert: jest.fn(), softDelete: jest.fn() } as unknown as Repository<any>;
  const mockUserDataAccessRepo = { insert: jest.fn(), softDelete: jest.fn() } as unknown as Repository<any>;

  const service = new DataAccessService(
    mockDataAccessRepo,
    mockDataSource,
    mockHierarchyValidation,
    mockHistoryLogger,
    mockPermissionCache,
    mockModuleRepo,
    mockRoleDataAccessRepo,
    mockUserDataAccessRepo,
  );

  return {
    service,
    mockDataAccessRepo,
    mockTransaction,
    mockHistoryLogger,
    mockPermissionCache,
    mockHierarchyValidation,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('DataAccessService.update()', () => {
  it('throws NotFoundException when record not found', async () => {
    const { service } = createService({ findOne: jest.fn().mockResolvedValue(null) });
    await expect(service.update(999, {})).rejects.toThrow(NotFoundException);
  });

  it('throws on duplicate user_id in user_permissions', async () => {
    const { service } = createService();
    const dto: UpdateDataAccessDto = {
      user_permissions: [
        { user_id: 5, permission_ids: [1] },
        { user_id: 5, permission_ids: [2] },
      ],
    };
    await expect(service.update(1, dto)).rejects.toThrow('duplicate_user_id_in_user_permissions');
  });

  it('calls hierarchy enforce when scope remains ALLOW', async () => {
    const enforce = jest.fn();
    const { service } = createService({ hierarchyEnforce: enforce });
    await service.update(1, { scope_type: SCOPE_TYPE.ALLOW });
    expect(enforce).toHaveBeenCalled();
  });

  it('calls hierarchy enforce when changing to ALLOW', async () => {
    const enforce = jest.fn();
    const record = { ...sampleRecord, scope_type: SCOPE_TYPE.DENY };
    const { service } = createService({
      findOne: jest.fn().mockResolvedValue(record),
      hierarchyEnforce: enforce,
    });
    await service.update(1, { scope_type: SCOPE_TYPE.ALLOW });
    expect(enforce).toHaveBeenCalled();
  });

  it('skips hierarchy enforce when scope is DENY', async () => {
    const enforce = jest.fn();
    const record = { ...sampleRecord, scope_type: SCOPE_TYPE.DENY };
    const { service } = createService({
      findOne: jest.fn().mockResolvedValue(record),
      hierarchyEnforce: enforce,
    });
    await service.update(1, {});
    expect(enforce).not.toHaveBeenCalled();
  });

  it('runs updates inside transaction', async () => {
    const transaction = jest.fn(async (cb: any) => {
      const manager = { save: jest.fn(), delete: jest.fn(), insert: jest.fn() };
      return cb(manager);
    });
    const { service } = createService({ transaction });
    await service.update(1, { scope_type: SCOPE_TYPE.DENY });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('replaces role junctions when role_ids provided', async () => {
    const transaction = jest.fn(async (cb: any) => {
      const manager = { save: jest.fn(), delete: jest.fn(), insert: jest.fn() };
      await cb(manager);
      // Verify delete was called to remove old roles
      expect(manager.delete).toHaveBeenCalled();
      // Verify insert was called with new roles
      expect(manager.insert).toHaveBeenCalled();
    });
    const { service } = createService({ transaction });
    await service.update(1, { role_ids: [7, 8] });
  });

  it('replaces user junctions when user_permissions provided', async () => {
    const transaction = jest.fn(async (cb: any) => {
      const manager = { save: jest.fn(), delete: jest.fn(), insert: jest.fn() };
      await cb(manager);
      expect(manager.delete).toHaveBeenCalled();
      expect(manager.insert).toHaveBeenCalled();
    });
    const { service } = createService({ transaction });
    await service.update(1, {
      user_permissions: [{ user_id: 20, permission_ids: [1, 2] }],
    });
  });

  it('returns { id } on success', async () => {
    const { service } = createService();
    const result = await service.update(1, { scope_type: SCOPE_TYPE.DENY });
    expect(result).toEqual({ id: 1 });
  });

  it('logs history with old and new values', async () => {
    const { service, mockHistoryLogger } = createService();
    await service.update(1, { scope_type: SCOPE_TYPE.DENY }, 'admin');
    expect(mockHistoryLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action_type: 'update',
        performed_by: 'admin',
        old_value: expect.objectContaining({ scope_type: SCOPE_TYPE.ALLOW }),
        new_value: expect.objectContaining({ scope_type: SCOPE_TYPE.DENY }),
      }),
    );
  });

  it('invalidates cache for both old and new users', async () => {
    const { service, mockPermissionCache } = createService();
    await service.update(1, {
      user_permissions: [{ user_id: 20, permission_ids: [1] }],
    });
    // Old user 10 + new user 20
    expect(mockPermissionCache.invalidateUser).toHaveBeenCalledWith(10);
    expect(mockPermissionCache.invalidateUser).toHaveBeenCalledWith(20);
  });
});
