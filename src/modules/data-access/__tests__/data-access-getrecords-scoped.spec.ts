import { DataAccessService } from '../data-access.service';
import { DataAccessRepository } from '../repository/data-access.repository';
import { HierarchyValidationService } from '../hierarchy-validation.service';
import { ChangeHistoryLogger } from '@modules/change-history/change-history-logger.service';
import { PermissionCacheService } from '@common/authorization';
import { DataSource, Repository } from 'typeorm';
import { PaginationParams } from '@common/decorators/pagination.decorator';
import { EXTRA_FIELDS_MAP } from '../constants/hierarchy-config';

// ── Mock factory ────────────────────────────────────────────────────────────

function createService(queryResults: any[]) {
  let callIndex = 0;
  const queryMock = jest.fn((..._args: any[]) => {
    const result = queryResults[callIndex] ?? [];
    callIndex++;
    return Promise.resolve(result);
  });

  const mockDataSource = { query: queryMock, transaction: jest.fn() } as unknown as DataSource;
  const mockDataAccessRepo = {} as DataAccessRepository;
  const mockHierarchyValidation = {} as HierarchyValidationService;
  const mockHistoryLogger = { log: jest.fn().mockReturnValue(Promise.resolve()) } as unknown as ChangeHistoryLogger;
  const mockPermissionCache = {
    invalidateByTable: jest.fn().mockReturnValue(Promise.resolve()),
    invalidateUser: jest.fn().mockReturnValue(Promise.resolve()),
  } as unknown as PermissionCacheService;
  const mockRecordPath = { buildPath: jest.fn().mockResolvedValue("ID: 0") } as unknown as import("../services/record-path.service").RecordPathService;
  const mockModuleRepo = {} as unknown as Repository<any>;
  const mockRoleDataAccessRepo = {} as unknown as Repository<any>;
  const mockUserDataAccessRepo = {} as unknown as Repository<any>;
  // Non-super-admin profile: the inline caller block resolves isSuperAdmin from the
  // users row (source of truth), so a plain { id } caller must find a non-super row.
  const mockUsersRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 1, type: 'staff' }),
  } as unknown as Repository<any>;

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
    { canManageRecord: jest.fn().mockResolvedValue(true), filterManageableRecords: jest.fn().mockResolvedValue([]), getEditAccessibleRecordIds: jest.fn().mockResolvedValue([]) } as any,
    mockUsersRepo,
  );

  return { service, queryMock };
}

const defaultPagination: PaginationParams = { page: 1, limit: 20, skip: 0 };

// ── Tests ───────────────────────────────────────────────────────────────────

describe('DataAccessService.getRecords() — owner scoping', () => {
  describe('unscoped path (no userInfo — internal callers)', () => {
    it('sees all records (no owner join injected)', async () => {
      const { service, queryMock } = createService([
        [{ total: 2 }],
        [
          { id: 1, display_name: 'A', created_at: '2026-01-01' },
          { id: 2, display_name: 'B', created_at: '2026-01-02' },
        ],
      ]);

      const result = await service.getRecords('bi_hub_reports', {}, defaultPagination, undefined);

      expect(result.data).toHaveLength(2);
      expect(result.meta.totalItems).toBe(2);
      const countSQL = queryMock.mock.calls[0][0] as string;
      expect(countSQL).not.toContain('resource_owners');
    });
  });

  describe('SO user (roles in junction)', () => {
    it('injects owner join for root table query', async () => {
      const { service, queryMock } = createService([
        // 1st: get roleIds
        [{ role_id: 3 }],
        // 2nd: count scoped
        [{ total: 1 }],
        // 3rd: data scoped
        [{ id: 1, display_name: 'Dept A', created_at: '2026-01-01' }],
      ]);

      const result = await service.getRecords('bi_hub_bicc_departments', {}, defaultPagination, { id: 10 }, 'user');

      expect(result.data).toHaveLength(1);
      // Query should contain junction join
      const countSQL = queryMock.mock.calls[1][0] as string;
      expect(countSQL).toContain('resource_owners');
    });

    it('injects owner join for child table (bi_hub_reports)', async () => {
      const { service, queryMock } = createService([
        [{ role_id: 3 }],
        [{ total: 1 }],
        [{ id: 10, display_name: 'Q2 Report', created_at: '2026-01-01' }],
      ]);

      const result = await service.getRecords('bi_hub_reports', {}, defaultPagination, { id: 10 }, 'user');

      expect(result.data).toHaveLength(1);
      const countSQL = queryMock.mock.calls[1][0] as string;
      expect(countSQL).toContain('bi_hub_bicc_departments');
      expect(countSQL).toContain('resource_owners');
    });

    it('injects owner join for deep child (ma_tool_documents)', async () => {
      const { service, queryMock } = createService([
        [{ role_id: 5 }],
        [{ total: 1 }],
        [{ id: 20, display_name: 'Doc X', created_at: '2026-01-01' }],
      ]);

      const result = await service.getRecords('ma_tool_documents', {}, defaultPagination, { id: 10 }, 'user');

      expect(result.data).toHaveLength(1);
      const countSQL = queryMock.mock.calls[1][0] as string;
      expect(countSQL).toContain('ma_tool_templates');
      expect(countSQL).toContain('ma_tool_workspaces');
      expect(countSQL).toContain('resource_owners');
    });

    it('passes roleIds as query parameter', async () => {
      const { service, queryMock } = createService([[{ role_id: 3 }, { role_id: 7 }], [{ total: 0 }], []]);

      await service.getRecords('bi_hub_reports', {}, defaultPagination, { id: 10 }, 'user');

      // Count query params should include role_ids array
      const countParams = queryMock.mock.calls[1][1] as any[];
      expect(countParams).toContainEqual([3, 7]);
    });

    it('enriches scoped records with configured record_extra without record_path', async () => {
      EXTRA_FIELDS_MAP.bi_hub_reports = ['code'];
      try {
        const { service } = createService([
          [{ role_id: 3 }],
          [{ total: 1 }],
          [{ id: 10, display_name: 'Q2 Report', created_at: '2026-01-01' }],
          [{ id: 10, code: 'RPT-10' }],
        ]);

        const result = await service.getRecords('bi_hub_reports', {}, defaultPagination, { id: 10 }, 'user');

        expect(result.data[0]).toMatchObject({
          id: 10,
          record_extra: { code: 'RPT-10' },
        });
        expect(result.data[0]).not.toHaveProperty('record_path');
      } finally {
        delete EXTRA_FIELDS_MAP.bi_hub_reports;
      }
    });
  });

  describe('non-SO user (no roles in junction)', () => {
    it('returns empty when user has no roles', async () => {
      const { service } = createService([
        [], // no roles
      ]);

      const result = await service.getRecords('bi_hub_reports', {}, defaultPagination, { id: 99 }, 'user');

      expect(result.data).toHaveLength(0);
      expect(result.meta.totalItems).toBe(0);
    });
  });

  describe('unscoped table (no ROOT_OWNER_CONFIG)', () => {
    it('returns empty for bi_payment table', async () => {
      const { service } = createService([
        [{ role_id: 3 }], // user has roles
      ]);

      const result = await service.getRecords('bi_payment_projects', {}, defaultPagination, { id: 10 }, 'user');

      expect(result.data).toHaveLength(0);
      expect(result.meta.totalItems).toBe(0);
    });
  });

  describe('no userInfo (backward compat)', () => {
    it('returns all records when userInfo not provided', async () => {
      const { service } = createService([[{ total: 3 }], [{ id: 1, display_name: 'A', created_at: '2026-01-01' }]]);

      const result = await service.getRecords('bi_hub_reports', {}, defaultPagination);

      expect(result.meta.totalItems).toBe(3);
    });
  });
});
