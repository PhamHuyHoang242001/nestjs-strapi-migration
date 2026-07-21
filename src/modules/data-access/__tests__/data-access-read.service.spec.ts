import { DataAccessService } from '../data-access.service';
import { DataAccessRepository } from '../repository/data-access.repository';
import { HierarchyValidationService } from '../hierarchy-validation.service';
import { ChangeHistoryLogger } from '@modules/change-history/change-history-logger.service';
import { PermissionCacheService } from '@common/authorization';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { SCOPE_TYPE } from '@common/enums';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EXTRA_FIELDS_MAP } from '../constants/hierarchy-config';

// ── Mock factory ────────────────────────────────────────────────────────────

function createService(
  overrides: {
    repoFindOne?: jest.Mock;
    query?: jest.Mock;
    queryBuilder?: any;
  } = {},
) {
  const mockQueryBuilder = overrides.queryBuilder ?? {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };

  const mockDataSource = {
    query: overrides.query ?? jest.fn().mockResolvedValue([]),
    transaction: jest.fn(),
  } as unknown as DataSource;

  const mockDataAccessRepo = {
    findOne: overrides.repoFindOne ?? jest.fn().mockResolvedValue(null),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  } as unknown as DataAccessRepository;

  const mockHierarchyValidation = { enforce: jest.fn() } as unknown as HierarchyValidationService;
  const mockHistoryLogger = { log: jest.fn().mockReturnValue(Promise.resolve()) } as unknown as ChangeHistoryLogger;
  const mockPermissionCache = {
    invalidateByTable: jest.fn().mockReturnValue(Promise.resolve()),
    invalidateUser: jest.fn().mockReturnValue(Promise.resolve()),
  } as unknown as PermissionCacheService;
  const mockRecordPath = {
    buildPath: jest.fn().mockResolvedValue('ID: 0'),
  } as unknown as import('../services/record-path.service').RecordPathService;

  const mockModuleRepo = {} as unknown as Repository<any>;
  const mockRoleDataAccessRepo = {} as unknown as Repository<any>;
  const mockUserDataAccessRepo = {} as unknown as Repository<any>;

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

  return { service, mockDataAccessRepo, mockDataSource, mockQueryBuilder };
}

// ── details() ───────────────────────────────────────────────────────────────

describe('DataAccessService.details()', () => {
  it('throws NotFoundException when record not found', async () => {
    const { service } = createService({ repoFindOne: jest.fn().mockResolvedValue(null) });
    await expect(service.details(999)).rejects.toThrow(NotFoundException);
  });

  it('returns record with relations and record_info', async () => {
    const record = {
      id: 1,
      data_id: 42,
      module_id: 5,
      module: { id: 5, table_name: 'bi_hub_reports' },
      role_data_access: [],
      user_data_access: [],
    };
    const query = jest.fn().mockResolvedValueOnce([{ id: 42, display_name: 'Q2 Report' }]);

    const { service } = createService({
      repoFindOne: jest.fn().mockResolvedValue(record),
      query,
    });
    const result = await service.details(1);

    expect(result.record_info).toEqual({ id: 42, display_name: 'Q2 Report' });
  });

  it('returns null record_info when target record deleted', async () => {
    const record = {
      id: 1,
      data_id: 42,
      module_id: 5,
      module: { id: 5, table_name: 'bi_hub_reports' },
      role_data_access: [],
      user_data_access: [],
    };
    const { service } = createService({
      repoFindOne: jest.fn().mockResolvedValue(record),
      query: jest.fn().mockResolvedValue([]),
    });
    const result = await service.details(1);
    expect(result.record_info).toBeNull();
  });

  it('skips record_info query when table not in ALLOWED_TABLES', async () => {
    const record = {
      id: 1,
      data_id: 42,
      module_id: 5,
      module: { id: 5, table_name: 'unknown_table' },
      role_data_access: [],
      user_data_access: [],
    };
    const query = jest.fn();
    const { service } = createService({
      repoFindOne: jest.fn().mockResolvedValue(record),
      query,
    });
    const result = await service.details(1);
    expect(query).not.toHaveBeenCalled();
    expect(result.record_info).toBeNull();
  });
});

// ── getByUser() ─────────────────────────────────────────────────────────────

describe('DataAccessService.getByUser()', () => {
  it('queries with user_id filter and returns results', async () => {
    const records = [{ id: 1, data_id: 42 }];
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(records),
    };
    const { service } = createService({ queryBuilder: qb });
    const result = await service.getByUser(10);

    expect(qb.where).toHaveBeenCalledWith('uda.user_id = :userId', { userId: 10 });
    expect(qb.andWhere).toHaveBeenCalledWith('uda.deleted_at IS NULL');
    expect(result).toEqual(records);
  });
});

// ── getByRole() ─────────────────────────────────────────────────────────────

describe('DataAccessService.getByRole()', () => {
  it('queries with role_id filter and returns results', async () => {
    const records = [{ id: 2, data_id: 10 }];
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(records),
    };
    const { service } = createService({ queryBuilder: qb });
    const result = await service.getByRole(3);

    expect(qb.where).toHaveBeenCalledWith('rda.role_id = :roleId', { roleId: 3 });
    expect(qb.andWhere).toHaveBeenCalledWith('rda.deleted_at IS NULL');
    expect(result).toEqual(records);
  });
});

// ── getRecords() ────────────────────────────────────────────────────────────

describe('DataAccessService.getRecords()', () => {
  it('throws BadRequestException for disallowed table', async () => {
    const { service } = createService();
    await expect(service.getRecords('users', {}, { page: 1, limit: 20, skip: 0 })).rejects.toThrow(BadRequestException);
  });

  it('returns paginated records from allowed table', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ total: 5 }]) // count
      .mockResolvedValueOnce([
        { id: 1, display_name: 'Report A', created_at: '2026-01-01' },
        { id: 2, display_name: 'Report B', created_at: '2026-01-02' },
      ]);

    const { service } = createService({ query });
    const result = await service.getRecords('bi_hub_reports', {}, { page: 1, limit: 20, skip: 0 });

    expect(result.data).toHaveLength(2);
    expect(result.data[0]).not.toHaveProperty('record_path');
    expect(result.data[0]).not.toHaveProperty('record_extra');
    expect(result.meta.totalItems).toBe(5);
    expect(result.meta.itemsPerPage).toBe(20);
  });

  it('returns configured record_extra without record_path', async () => {
    EXTRA_FIELDS_MAP.bi_hub_reports = ['code', 'status'];
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        {
          id: 42,
          display_name: 'Revenue',
          created_at: '2026-01-01',
        },
      ])
      .mockResolvedValueOnce([{ id: 42, code: 'RPT-42', status: 'active' }]);

    try {
      const { service } = createService({ query });
      const result = await service.getRecords('bi_hub_reports', {}, { page: 1, limit: 20, skip: 0 });

      expect(result.data[0]).toEqual({
        id: 42,
        display_name: 'Revenue',
        created_at: '2026-01-01',
        record_extra: { code: 'RPT-42', status: 'active' },
      });
      const queryCalls = query.mock.calls as unknown as Array<[string, unknown[]?]>;
      expect(queryCalls[2][0]).toContain('"code"');
      expect(queryCalls[2][0]).toContain('"status"');
    } finally {
      delete EXTRA_FIELDS_MAP.bi_hub_reports;
    }
  });

  it('omits record_extra when the configured extras query fails', async () => {
    EXTRA_FIELDS_MAP.bi_hub_reports = ['missing_column'];
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{ id: 42, display_name: 'Revenue', created_at: '2026-01-01' }])
      .mockRejectedValueOnce(new Error('column does not exist'));

    try {
      const { service } = createService({ query });
      const result = await service.getRecords('bi_hub_reports', {}, { page: 1, limit: 20, skip: 0 });

      expect(result.data[0]).not.toHaveProperty('record_path');
      expect(result.data[0]).not.toHaveProperty('record_extra');
    } finally {
      delete EXTRA_FIELDS_MAP.bi_hub_reports;
    }
  });

  it('applies search filter on id and name column', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{ id: 1, display_name: 'Revenue', created_at: '2026-01-01' }]);

    const { service } = createService({ query });
    await service.getRecords('bi_hub_reports', { keyword: 'Revenue' }, { page: 1, limit: 20, skip: 0 });

    const countSQL = query.mock.calls[0][0] as string;
    expect(countSQL).toContain('ILIKE');
    expect(query.mock.calls[0][1]).toContain('%Revenue%');
  });

  it('applies date_from and date_to filters', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    const { service } = createService({ query });
    await service.getRecords(
      'bi_hub_reports',
      { date_from: '2026-01-01', date_to: '2026-12-31' },
      { page: 1, limit: 20, skip: 0 },
    );

    const countSQL = query.mock.calls[0][0] as string;
    expect(countSQL).toContain('created_at >=');
    expect(countSQL).toContain('created_at <=');
  });
});
