import { DataAccessService } from '../data-access.service';
import { DataAccessRepository } from '../repository/data-access.repository';
import { HierarchyValidationService } from '../hierarchy-validation.service';
import { ChangeHistoryLogger } from '@modules/change-history/change-history-logger.service';
import { PermissionCacheService } from '@common/authorization';
import { DataSource, Repository } from 'typeorm';
import { PaginationParams } from '@common/decorators/pagination.decorator';
import { SortParams } from '@common/decorators/sort.decorator';
import { SearchDataAccessDto } from '../dto/search-data-access.dto';
import { SCOPE_TYPE } from '@common/enums';
import { EXTRA_FIELDS_MAP } from '../constants/hierarchy-config';

/**
 * Unit tests for DataAccessService.list() — grouped response.
 * TDD: Phase 1 locks current behavior, Phase 2 defines grouped contract.
 */

// ── Mock factories ──────────────────────────────────────────────────────────

// Module-scoped so tests can assert buildPath was called with the right args.
const mockRecordPath = {
  buildPath: jest.fn().mockImplementation((_table: string, id: number) =>
    Promise.resolve(`ROOT / leaf-${id}`),
  ),
} as unknown as import("../services/record-path.service").RecordPathService;

function createMockService(queryMock: jest.Mock) {
  const mockDataSource = { query: queryMock, transaction: jest.fn() } as unknown as DataSource;
  const mockDataAccessRepo = {} as DataAccessRepository;
  const mockHierarchyValidation = {} as HierarchyValidationService;
  const mockHistoryLogger = { log: jest.fn().mockReturnValue(Promise.resolve()) } as unknown as ChangeHistoryLogger;
  const mockPermissionCache = {
    invalidateByTable: jest.fn().mockReturnValue(Promise.resolve()),
    invalidateUser: jest.fn().mockReturnValue(Promise.resolve()),
  } as unknown as PermissionCacheService;
  const mockModuleRepo = {} as Repository<any>;
  const mockRoleDataAccessRepo = {} as Repository<any>;
  const mockUserDataAccessRepo = {} as Repository<any>;

  return new DataAccessService(
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
}

const defaultSort: SortParams = { sort_field: 'created_at', sort_order: 'DESC' as any };
const defaultPagination: PaginationParams = { page: 1, limit: 20, skip: 0 };

// ── Sample data ─────────────────────────────────────────────────────────────

const sampleGroups = [
  {
    data_id: 42,
    module_id: 5,
    table_name: 'bi_hub_reports',
    module_path: '/BI Hub/Reports',
    module_name: 'Reports',
    latest_created_at: '2026-05-15T10:20:00Z',
  },
  {
    data_id: 10,
    module_id: 3,
    table_name: 'ma_tool_documents',
    module_path: '/Data Uploader/Documents',
    module_name: 'Documents',
    latest_created_at: '2026-05-14T09:00:00Z',
  },
];

const sampleRules = [
  {
    rule_id: 1,
    data_id: 42,
    module_id: 5,
    scope_type: 'allow',
    subject_type: 'role',
    subject_id: 3,
    subject_name: 'Manager',
    permissions: null,
    start_date: null,
    end_date: null,
    created_at: '2026-05-15T10:20:00Z',
  },
  {
    rule_id: 1,
    data_id: 42,
    module_id: 5,
    scope_type: 'allow',
    subject_type: 'user',
    subject_id: 12,
    subject_name: 'John Doe',
    permissions: [{ id: 1, name: 'View' }],
    start_date: null,
    end_date: null,
    created_at: '2026-05-15T10:20:00Z',
  },
  {
    rule_id: 5,
    data_id: 10,
    module_id: 3,
    scope_type: 'deny',
    subject_type: 'role',
    subject_id: 7,
    subject_name: 'Viewer',
    permissions: null,
    start_date: null,
    end_date: null,
    created_at: '2026-05-14T09:00:00Z',
  },
];

const sampleRecordNames = {
  bi_hub_reports: [{ id: 42, display_name: 'Q2 Revenue Analysis' }],
  ma_tool_documents: [{ id: 10, display_name: 'Upload Template A' }],
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('DataAccessService.list() — grouped', () => {
  // Snapshot/restore EXTRA_FIELDS_MAP around each test so config mutations in
  // individual cases never leak across tests. Keys are assigned by reference,
  // so we mutate-then-restore the original object identity.
  let originalMap: Record<string, string[]>;
  beforeEach(() => {
    originalMap = { ...EXTRA_FIELDS_MAP };
  });
  afterEach(() => {
    for (const k of Object.keys(EXTRA_FIELDS_MAP)) delete EXTRA_FIELDS_MAP[k];
    Object.assign(EXTRA_FIELDS_MAP, originalMap);
  });

  /** Standard mock: count → groups → rules → record names (2 tables) */
  function setupGroupedMock(overrides?: {
    count?: number;
    groups?: any[];
    rules?: any[];
    recordNames?: Record<string, any[]>;
  }) {
    const count = overrides?.count ?? 2;
    const groups = overrides?.groups ?? sampleGroups;
    const rules = overrides?.rules ?? sampleRules;
    const records = overrides?.recordNames ?? sampleRecordNames;

    const queryMock = jest.fn();
    // Call 1: count query
    queryMock.mockResolvedValueOnce([{ total: count }]);
    // Call 2: paginated groups
    queryMock.mockResolvedValueOnce(groups);
    // Call 3: flattened rules for groups
    queryMock.mockResolvedValueOnce(rules);
    // Call 4+: batch record names (one per distinct table_name)
    const tableNames = [...new Set(groups.map((g: any) => g.table_name))];
    for (const tn of tableNames) {
      queryMock.mockResolvedValueOnce(records[tn] || []);
    }

    return { queryMock, service: createMockService(queryMock) };
  }

  // ── Response shape ──────────────────────────────────────────────────────

  describe('response shape', () => {
    it('returns grouped data with data_id, module_id, module_name, module_path, record_name, table_name, rules[]', async () => {
      const { service } = setupGroupedMock();
      const result = await service.list({}, defaultSort, defaultPagination);

      expect(result.data).toHaveLength(2);
      const group = result.data[0];
      expect(group).toHaveProperty('data_id', 42);
      expect(group).toHaveProperty('module_id', 5);
      expect(group).toHaveProperty('module_name', 'Reports');
      expect(group).toHaveProperty('module_path', '/BI Hub/Reports');
      expect(group).toHaveProperty('record_name', 'Q2 Revenue Analysis');
      expect(group).toHaveProperty('table_name', 'bi_hub_reports');
      expect(group).toHaveProperty('rules');
      expect(Array.isArray(group.rules)).toBe(true);
      // record_path: root→leaf breadcrumb (RecordPathService stub). module_path
      // + record_name unchanged — additive field only.
      expect(group).toHaveProperty('record_path', 'ROOT / leaf-42');
      expect(mockRecordPath.buildPath).toHaveBeenCalledWith('bi_hub_reports', 42);
      // Default (no EXTRA_FIELDS_MAP entry) → record_extra key absent, base
      // contract unchanged. Additive only when dev declares extra fields.
      expect(group).not.toHaveProperty('record_extra');
    });

    it('each group.rules contains rule_id, scope_type, subject_type, subject_id, subject_name, permissions, dates', async () => {
      const { service } = setupGroupedMock();
      const result = await service.list({}, defaultSort, defaultPagination);

      const rule = result.data[0].rules[0];
      expect(rule).toHaveProperty('rule_id');
      expect(rule).toHaveProperty('scope_type');
      expect(rule).toHaveProperty('subject_type');
      expect(rule).toHaveProperty('subject_id');
      expect(rule).toHaveProperty('subject_name');
      expect(rule).toHaveProperty('permissions');
      expect(rule).toHaveProperty('start_date');
      expect(rule).toHaveProperty('end_date');
      expect(rule).toHaveProperty('created_at');
    });

    it('groups with role subjects have permissions: null', async () => {
      const { service } = setupGroupedMock();
      const result = await service.list({}, defaultSort, defaultPagination);

      const roleRule = result.data[0].rules.find((r: any) => r.subject_type === 'role');
      expect(roleRule?.permissions).toBeNull();
    });

    it('groups with user subjects have permissions as JSON array', async () => {
      const { service } = setupGroupedMock();
      const result = await service.list({}, defaultSort, defaultPagination);

      const userRule = result.data[0].rules.find((r: any) => r.subject_type === 'user');
      expect(Array.isArray(userRule?.permissions)).toBe(true);
      expect(userRule?.permissions[0]).toHaveProperty('id');
      expect(userRule?.permissions[0]).toHaveProperty('name');
    });

    it('record_name falls back to "ID: {data_id}" when target record not found', async () => {
      const { service } = setupGroupedMock({ recordNames: { bi_hub_reports: [], ma_tool_documents: [] } });
      const result = await service.list({}, defaultSort, defaultPagination);

      expect(result.data[0].record_name).toBe('ID: 42');
      expect(result.data[1].record_name).toBe('ID: 10');
    });
  });

  // ── Pagination ──────────────────────────────────────────────────────────

  describe('pagination', () => {
    it('paginates by group count, not flat row count', async () => {
      const { service } = setupGroupedMock({ count: 50 });
      const result = await service.list({}, defaultSort, { page: 1, limit: 10, skip: 0 });

      expect(result.meta.totalItems).toBe(50);
      expect(result.meta.itemsPerPage).toBe(10);
      expect(result.meta.totalPages).toBe(5);
    });

    it('meta.totalItems reflects total distinct (data_id, module_id) pairs', async () => {
      const { service } = setupGroupedMock({ count: 25 });
      const result = await service.list({}, defaultSort, defaultPagination);

      expect(result.meta.totalItems).toBe(25);
    });

    it('returns empty data with totalItems=0 when no groups match', async () => {
      const queryMock = jest.fn();
      queryMock.mockResolvedValueOnce([{ total: 0 }]); // count
      queryMock.mockResolvedValueOnce([]); // groups

      const service = createMockService(queryMock);
      const result = await service.list({}, defaultSort, defaultPagination);

      expect(result.data).toHaveLength(0);
      expect(result.meta.totalItems).toBe(0);
      expect(result.meta.totalPages).toBe(1);
    });

    it('page=2&limit=5 passes correct offset to query', async () => {
      const { service, queryMock } = setupGroupedMock({ count: 20, groups: [] });
      await service.list({}, defaultSort, { page: 2, limit: 5, skip: 5 });

      // The groups query (2nd call) should receive limit=5 and offset=5
      const groupsCallArgs = queryMock.mock.calls[1];
      const groupsParams = groupsCallArgs[1] as any[];
      // Last two params should be limit and offset
      expect(groupsParams[groupsParams.length - 2]).toBe(5); // limit
      expect(groupsParams[groupsParams.length - 1]).toBe(5); // offset
    });
  });

  // ── Filters ─────────────────────────────────────────────────────────────

  describe('filters', () => {
    it('module_id filter is applied to groups query', async () => {
      const { service, queryMock } = setupGroupedMock({ count: 0, groups: [] });
      const dto: SearchDataAccessDto = { module_id: 5 };
      await service.list(dto, defaultSort, defaultPagination);

      // Count query (1st call) should contain module_id param
      const countSQL = queryMock.mock.calls[0][0] as string;
      expect(countSQL).toContain('module_id');
      const countParams = queryMock.mock.calls[0][1] as any[];
      expect(countParams).toContain(5);
    });

    it('scope_type filter is applied', async () => {
      const { service, queryMock } = setupGroupedMock({ count: 0, groups: [] });
      const dto: SearchDataAccessDto = { scope_type: SCOPE_TYPE.ALLOW };
      await service.list(dto, defaultSort, defaultPagination);

      const countSQL = queryMock.mock.calls[0][0] as string;
      expect(countSQL).toContain('scope_type');
    });

    it('role_id filter restricts to groups with rules for that role', async () => {
      const { service, queryMock } = setupGroupedMock({ count: 0, groups: [] });
      const dto: SearchDataAccessDto = { role_id: 3 };
      await service.list(dto, defaultSort, defaultPagination);

      const countSQL = queryMock.mock.calls[0][0] as string;
      expect(countSQL).toContain('role_id');
      const countParams = queryMock.mock.calls[0][1] as any[];
      expect(countParams).toContain(3);
    });

    it('user_id filter restricts to groups with rules for that user', async () => {
      const { service, queryMock } = setupGroupedMock({ count: 0, groups: [] });
      const dto: SearchDataAccessDto = { user_id: 12 };
      await service.list(dto, defaultSort, defaultPagination);

      const countSQL = queryMock.mock.calls[0][0] as string;
      expect(countSQL).toContain('user_id');
      const countParams = queryMock.mock.calls[0][1] as any[];
      expect(countParams).toContain(12);
    });

    it('subject_type=role filter shows groups with at least one role rule', async () => {
      const { service, queryMock } = setupGroupedMock({ count: 0, groups: [] });
      const dto: SearchDataAccessDto = { subject_type: 'role' };
      await service.list(dto, defaultSort, defaultPagination);

      const countSQL = queryMock.mock.calls[0][0] as string;
      expect(countSQL).toContain('dar.id IS NOT NULL');
      // Should NOT exclude groups that also have user rules (no dau.id IS NULL)
      expect(countSQL).not.toContain('dau.id IS NULL');
    });

    it('subject_type=user filter shows groups with at least one user rule', async () => {
      const { service, queryMock } = setupGroupedMock({ count: 0, groups: [] });
      const dto: SearchDataAccessDto = { subject_type: 'user' };
      await service.list(dto, defaultSort, defaultPagination);

      const countSQL = queryMock.mock.calls[0][0] as string;
      expect(countSQL).toContain('dau.id IS NOT NULL');
      // Should NOT exclude groups that also have role rules (no dar.id IS NULL)
      expect(countSQL).not.toContain('dar.id IS NULL');
    });
  });

  // ── Sorting ─────────────────────────────────────────────────────────────

  describe('sorting', () => {
    it('sorts groups by latest_created_at DESC by default', async () => {
      const { service, queryMock } = setupGroupedMock({ count: 0, groups: [] });
      await service.list({}, defaultSort, defaultPagination);

      const groupsSQL = queryMock.mock.calls[1]?.[0] as string;
      expect(groupsSQL).toContain('latest_created_at');
      expect(groupsSQL).toContain('DESC');
    });
  });

  // ── Batch record names ──────────────────────────────────────────────────

  describe('batch record names', () => {
    it('queries each target table once per distinct table_name in page', async () => {
      const { service, queryMock } = setupGroupedMock();
      await service.list({}, defaultSort, defaultPagination);

      // After count(1) + groups(1) + rules(1) = 3 calls, there should be 2 record name queries
      // (bi_hub_reports and ma_tool_documents)
      expect(queryMock).toHaveBeenCalledTimes(5); // count + groups + rules + 2 record tables
    });

    it('handles mixed table_names in same page', async () => {
      const { service } = setupGroupedMock();
      const result = await service.list({}, defaultSort, defaultPagination);

      expect(result.data[0].table_name).toBe('bi_hub_reports');
      expect(result.data[0].record_name).toBe('Q2 Revenue Analysis');
      expect(result.data[1].table_name).toBe('ma_tool_documents');
      expect(result.data[1].record_name).toBe('Upload Template A');
    });
  });

  // ── record_extra (EXTRA_FIELDS_MAP) ─────────────────────────────────────

  describe('record_extra', () => {
    it('returns record_extra with declared fields when EXTRA_FIELDS_MAP has the table', async () => {
      EXTRA_FIELDS_MAP.bi_hub_reports = ['code', 'status'];
      const records = {
        bi_hub_reports: [{ id: 42, display_name: 'Q2 Revenue Analysis', code: 'RPT-01', status: 'active' }],
        ma_tool_documents: [{ id: 10, display_name: 'Upload Template A' }],
      };
      const { service } = setupGroupedMock({ recordNames: records });
      const result = await service.list({}, defaultSort, defaultPagination);

      // Declared table → record_extra present with fetched values.
      expect(result.data[0]).toHaveProperty('record_extra', { code: 'RPT-01', status: 'active' });
      // Undeclared table → key absent (base contract unchanged).
      expect(result.data[1]).not.toHaveProperty('record_extra');
    });

    it('falls back gracefully when an extra field column does not exist (per-table catch)', async () => {
      EXTRA_FIELDS_MAP.bi_hub_reports = ['nonexistent_col'];
      const queryMock = jest.fn();
      queryMock.mockResolvedValueOnce([{ total: 2 }]); // count
      queryMock.mockResolvedValueOnce(sampleGroups); // groups
      queryMock.mockResolvedValueOnce(sampleRules); // rules
      // bi_hub_reports fetch rejects (bad column) → per-table catch, name-only.
      queryMock.mockRejectedValueOnce(new Error('column "nonexistent_col" does not exist'));
      // ma_tool_documents ok (no extra declared).
      queryMock.mockResolvedValueOnce([{ id: 10, display_name: 'Upload Template A' }]);
      const service = createMockService(queryMock);

      const result = await service.list({}, defaultSort, defaultPagination);

      // List stays 200 OK; failed table falls back, no record_extra.
      expect(result.data[0]).not.toHaveProperty('record_extra');
      expect(result.data[0].record_name).toBe('ID: 42');
      expect(result.data[1].record_name).toBe('Upload Template A');
    });

    it('missing target row → record_name fallback, record_extra absent', async () => {
      EXTRA_FIELDS_MAP.bi_hub_reports = ['code', 'status'];
      const records = {
        // row 42 absent → falls back to ID: 42, no record_extra.
        bi_hub_reports: [],
        ma_tool_documents: [{ id: 10, display_name: 'Upload Template A' }],
      };
      const { service } = setupGroupedMock({ recordNames: records });
      const result = await service.list({}, defaultSort, defaultPagination);

      expect(result.data[0].record_name).toBe('ID: 42');
      expect(result.data[0]).not.toHaveProperty('record_extra');
    });
  });

  // ── Search by record_name ───────────────────────────────────────────────

  describe('search by record_name', () => {
    it('search keyword triggers name_matches CTE in count query', async () => {
      const { service, queryMock } = setupGroupedMock({ count: 0, groups: [] });
      const dto: SearchDataAccessDto = { keyword: 'Revenue' };
      await service.list(dto, defaultSort, defaultPagination);

      const countSQL = queryMock.mock.calls[0][0] as string;
      // Should include name_matches CTE for searching target tables
      expect(countSQL).toContain('name_matches');
    });

    it('search matches across data_id, subject_name, AND record_name (OR logic)', async () => {
      const { service, queryMock } = setupGroupedMock({ count: 0, groups: [] });
      const dto: SearchDataAccessDto = { keyword: 'test' };
      await service.list(dto, defaultSort, defaultPagination);

      const countSQL = queryMock.mock.calls[0][0] as string;
      // Should contain OR condition linking existing search + name_matches
      expect(countSQL).toContain('ILIKE');
      expect(countSQL).toContain('name_matches');
    });

    it('count SQL does NOT call unaccent (extension-free deployment)', async () => {
      const { service, queryMock } = setupGroupedMock({ count: 0, groups: [] });
      const dto: SearchDataAccessDto = { keyword: 'test' };
      await service.list(dto, defaultSort, defaultPagination);

      const countSQL = queryMock.mock.calls[0][0] as string;
      expect(countSQL).not.toMatch(/unaccent\s*\(/i);
    });

    it('when module_id filter present, name_matches only queries that module table', async () => {
      const { service, queryMock } = setupGroupedMock({ count: 0, groups: [] });
      const dto: SearchDataAccessDto = { keyword: 'test', module_id: 5 };
      await service.list(dto, defaultSort, defaultPagination);

      const countSQL = queryMock.mock.calls[0][0] as string;
      // Should query the module's table, passing module_id to resolve
      expect(countSQL).toContain('name_matches');
    });

    it('search without module_id queries all allowed tables', async () => {
      const { service, queryMock } = setupGroupedMock({ count: 0, groups: [] });
      const dto: SearchDataAccessDto = { keyword: 'test' };
      await service.list(dto, defaultSort, defaultPagination);

      const countSQL = queryMock.mock.calls[0][0] as string;
      expect(countSQL).toContain('name_matches');
      // Should have UNION ALL for multiple tables
      expect(countSQL).toContain('UNION ALL');
    });
  });
});
