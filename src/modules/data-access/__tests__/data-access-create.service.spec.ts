import { DataAccessService } from '../data-access.service';
import { DataAccessRepository } from '../repository/data-access.repository';
import { HierarchyValidationService } from '../hierarchy-validation.service';
import { ChangeHistoryLogger } from '@modules/change-history/change-history-logger.service';
import { PermissionCacheService } from '@common/authorization';
import { DataSource, Repository } from 'typeorm';
import { SCOPE_TYPE } from '@common/enums';
import { CreateDataAccessDto } from '../dto/create-data-access.dto';
import { BadRequestException } from '@nestjs/common';

// ── Mock factories ──────────────────────────────────────────────────────────

function createService(overrides: {
  transaction?: jest.Mock;
  query?: jest.Mock;
  moduleRepo?: Partial<Repository<any>>;
  hierarchyEnforce?: jest.Mock;
} = {}) {
  const mockTransaction = overrides.transaction ?? jest.fn(async (cb: any) => {
    const manager = {
      create: jest.fn((_: any, data: any) => ({ id: 1, ...data })),
      save: jest.fn(async (entity: any) => ({ ...entity, id: entity.id ?? 1 })),
      insert: jest.fn(),
      delete: jest.fn(),
      softDelete: jest.fn(),
    };
    return cb(manager);
  });

  const mockDataSource = {
    query: overrides.query ?? jest.fn().mockResolvedValue([]),
    transaction: mockTransaction,
  } as unknown as DataSource;

  const mockDataAccessRepo = {} as DataAccessRepository;
  const mockHierarchyValidation = {
    enforce: overrides.hierarchyEnforce ?? jest.fn(),
  } as unknown as HierarchyValidationService;
  const mockHistoryLogger = { log: jest.fn().mockReturnValue(Promise.resolve()) } as unknown as ChangeHistoryLogger;
  const mockPermissionCache = {
    invalidateByTable: jest.fn().mockReturnValue(Promise.resolve()),
    invalidateUser: jest.fn().mockReturnValue(Promise.resolve()),
  } as unknown as PermissionCacheService;

  const mockModuleRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 1, table_name: 'bi_hub_reports', name: 'Reports' }),
    ...overrides.moduleRepo,
  } as unknown as Repository<any>;

  const mockRoleDataAccessRepo = { insert: jest.fn(), softDelete: jest.fn() } as unknown as Repository<any>;
  const mockUserDataAccessRepo = { insert: jest.fn(), softDelete: jest.fn() } as unknown as Repository<any>;

  const service = new DataAccessService(
    mockDataAccessRepo, mockDataSource, mockHierarchyValidation,
    mockHistoryLogger, mockPermissionCache, mockModuleRepo,
    mockRoleDataAccessRepo, mockUserDataAccessRepo,
  );

  return { service, mockDataSource, mockTransaction, mockHistoryLogger, mockPermissionCache, mockModuleRepo, mockHierarchyValidation };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('DataAccessService.create()', () => {
  const baseDto: CreateDataAccessDto = {
    data_ids: [1, 2],
    module_id: 1,
    scope_type: SCOPE_TYPE.ALLOW,
    role_ids: [3],
  };

  it('throws when neither role_ids nor user_permissions provided', async () => {
    const { service } = createService();
    const dto: CreateDataAccessDto = { data_ids: [1], module_id: 1, scope_type: SCOPE_TYPE.ALLOW };
    await expect(service.create(dto)).rejects.toThrow(BadRequestException);
  });

  it('throws on duplicate user_id in user_permissions', async () => {
    const { service } = createService();
    const dto: CreateDataAccessDto = {
      data_ids: [1], module_id: 1, scope_type: SCOPE_TYPE.ALLOW,
      user_permissions: [
        { user_id: 5, permission_ids: [1] },
        { user_id: 5, permission_ids: [2] },
      ],
    };
    await expect(service.create(dto)).rejects.toThrow('duplicate_user_id_in_user_permissions');
  });

  it('throws when module not found', async () => {
    const { service } = createService({ moduleRepo: { findOne: jest.fn().mockResolvedValue(null) } });
    await expect(service.create(baseDto)).rejects.toThrow('module_not_found');
  });

  it('throws when module table_name not in ALLOWED_TABLES', async () => {
    const { service } = createService({
      moduleRepo: { findOne: jest.fn().mockResolvedValue({ id: 1, table_name: 'forbidden_table' }) },
    });
    await expect(service.create(baseDto)).rejects.toThrow('table_not_allowed');
  });

  it('calls hierarchy enforce for ALLOW scope', async () => {
    const enforce = jest.fn();
    const { service } = createService({ hierarchyEnforce: enforce });
    await service.create(baseDto);
    expect(enforce).toHaveBeenCalledWith([1, 2], 'bi_hub_reports', [], [3]);
  });

  it('skips hierarchy enforce for DENY scope', async () => {
    const enforce = jest.fn();
    const { service } = createService({ hierarchyEnforce: enforce });
    await service.create({ ...baseDto, scope_type: SCOPE_TYPE.DENY });
    expect(enforce).not.toHaveBeenCalled();
  });

  it('creates records inside a transaction for each data_id', async () => {
    const transaction = jest.fn(async (cb: any) => {
      const manager = {
        create: jest.fn((_: any, data: any) => ({ id: 100, ...data })),
        save: jest.fn(async (entity: any) => entity),
        insert: jest.fn(),
      };
      return cb(manager);
    });
    const { service } = createService({ transaction });
    const result = await service.create(baseDto);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('ids');
    expect(result.ids).toHaveLength(2);
  });

  it('returns saved ids', async () => {
    let counter = 10;
    const transaction = jest.fn(async (cb: any) => {
      const manager = {
        create: jest.fn((_: any, data: any) => ({ ...data, id: ++counter })),
        save: jest.fn(async (entity: any) => entity),
        insert: jest.fn(),
      };
      return cb(manager);
    });
    const { service } = createService({ transaction });
    const result = await service.create(baseDto);
    expect(result.ids).toEqual([11, 12]);
  });

  it('logs history after creation', async () => {
    const { service, mockHistoryLogger } = createService();
    await service.create(baseDto, 'admin');
    expect(mockHistoryLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action_type: 'create', performed_by: 'admin' }),
    );
  });

  it('invalidates permission cache by table', async () => {
    const { service, mockPermissionCache } = createService();
    await service.create(baseDto);
    expect(mockPermissionCache.invalidateByTable).toHaveBeenCalledWith('bi_hub_reports');
  });

  it('invalidates permission cache per affected user', async () => {
    const { service, mockPermissionCache } = createService();
    const dto: CreateDataAccessDto = {
      data_ids: [1], module_id: 1, scope_type: SCOPE_TYPE.ALLOW,
      user_permissions: [{ user_id: 5, permission_ids: [1, 2] }],
    };
    await service.create(dto);
    expect(mockPermissionCache.invalidateUser).toHaveBeenCalledWith(5);
  });
});
