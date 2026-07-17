import { DataAccessService, ScopeUserInfo } from '../data-access.service';
import { DataAccessRepository } from '../repository/data-access.repository';
import { HierarchyValidationService } from '../hierarchy-validation.service';
import { ChangeHistoryLogger } from '@modules/change-history/change-history-logger.service';
import { PermissionCacheService } from '@common/authorization';
import { DataSource, Repository } from 'typeorm';
import { PaginationParams } from '@common/decorators/pagination.decorator';
import { SortParams } from '@common/decorators/sort.decorator';
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

  return { service, queryMock };
}

const defaultSort: SortParams = { sort_field: 'created_at', sort_order: 'DESC' as any };
const defaultPagination: PaginationParams = { page: 1, limit: 20, skip: 0 };

// ── Tests ───────────────────────────────────────────────────────────────────

describe('DataAccessService.list() — owner scoping', () => {
  // Snapshot/restore EXTRA_FIELDS_MAP so per-test config mutations don't leak.
  let originalMap: Record<string, string[]>;
  beforeEach(() => {
    originalMap = { ...EXTRA_FIELDS_MAP };
  });
  afterEach(() => {
    for (const k of Object.keys(EXTRA_FIELDS_MAP)) delete EXTRA_FIELDS_MAP[k];
    Object.assign(EXTRA_FIELDS_MAP, originalMap);
  });

  describe('unscoped path (no userInfo — internal callers)', () => {
    it('query does NOT contain accessible CTE', async () => {
      const { service, queryMock } = createService([
        [{ total: 2 }], // count
        [
          // groups
          {
            data_id: 42,
            module_id: 5,
            table_name: 'bi_hub_reports',
            module_path: '/BI Hub',
            module_name: 'Reports',
            latest_created_at: '2026-01-01',
          },
        ],
        [], // rules
        [], // record names
      ]);

      await service.list({}, defaultSort, defaultPagination, undefined);

      const countSQL = queryMock.mock.calls[0][0] as string;
      expect(countSQL).not.toContain('accessible');
    });
  });

  describe('SO user', () => {
    it('count query includes accessible CTE', async () => {
      const { service, queryMock } = createService([
        [{ role_id: 3 }], // get roleIds
        [{ total: 1 }], // count (with CTE)
        [
          {
            data_id: 42,
            module_id: 5,
            table_name: 'bi_hub_reports',
            module_path: '/BI Hub',
            module_name: 'Reports',
            latest_created_at: '2026-01-01',
          },
        ],
        [
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
            created_at: '2026-01-01',
          },
        ],
        [{ id: 42, display_name: 'Q2 Report' }],
      ]);

      await service.list({}, defaultSort, defaultPagination, { userId: 10, client: 'user' });

      // Count query (2nd call after roleIds) should contain accessible CTE
      const countSQL = queryMock.mock.calls[1][0] as string;
      expect(countSQL).toContain('accessible');
      expect(countSQL).toContain('UNION ALL');
    });

    it('groups query includes accessible filter', async () => {
      const { service, queryMock } = createService([
        [{ role_id: 3 }],
        [{ total: 1 }],
        [
          {
            data_id: 42,
            module_id: 5,
            table_name: 'bi_hub_reports',
            module_path: '/BI Hub',
            module_name: 'Reports',
            latest_created_at: '2026-01-01',
          },
        ],
        [
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
            created_at: '2026-01-01',
          },
        ],
        [{ id: 42, display_name: 'Q2 Report' }],
      ]);

      await service.list({}, defaultSort, defaultPagination, { userId: 10, client: 'user' });

      const groupsSQL = queryMock.mock.calls[2][0] as string;
      expect(groupsSQL).toContain('accessible');
    });

    it('returns scoped data correctly', async () => {
      const { service } = createService([
        [{ role_id: 3 }],
        [{ total: 1 }],
        [
          {
            data_id: 42,
            module_id: 5,
            table_name: 'bi_hub_reports',
            module_path: '/BI Hub',
            module_name: 'Reports',
            latest_created_at: '2026-01-01',
          },
        ],
        [
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
            created_at: '2026-01-01',
          },
        ],
        [{ id: 42, display_name: 'Q2 Report' }],
      ]);

      const result = await service.list({}, defaultSort, defaultPagination, { userId: 10, client: 'user' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].data_id).toBe(42);
      expect(result.meta.totalItems).toBe(1);
    });

    it('roleIds passed as parameter to CTE', async () => {
      const { service, queryMock } = createService([[{ role_id: 3 }, { role_id: 7 }], [{ total: 0 }], []]);

      await service.list({}, defaultSort, defaultPagination, { userId: 10, client: 'user' });

      // Count query params should include roleIds
      const countParams = queryMock.mock.calls[1][1] as any[];
      expect(countParams[0]).toEqual([3, 7]);
    });

    it('record_extra flows through the scoped (owner CTE) path', async () => {
      EXTRA_FIELDS_MAP.bi_hub_reports = ['code', 'status'];
      const { service } = createService([
        [{ role_id: 3 }], // roleIds
        [{ total: 1 }], // count (with accessible CTE)
        [
          {
            data_id: 42,
            module_id: 5,
            table_name: 'bi_hub_reports',
            module_path: '/BI Hub',
            module_name: 'Reports',
            latest_created_at: '2026-01-01',
          },
        ], // groups
        [], // rules (none for brevity)
        [{ id: 42, display_name: 'Q2 Report', code: 'RPT-01', status: 'active' }], // record info
      ]);

      const result = await service.list({}, defaultSort, defaultPagination, { userId: 10, client: 'user' });

      expect(result.data[0]).toHaveProperty('record_extra', { code: 'RPT-01', status: 'active' });
    });
  });

  describe('non-SO user', () => {
    it('returns empty when user has no roles', async () => {
      const { service } = createService([
        [], // no roles
      ]);

      const result = await service.list({}, defaultSort, defaultPagination, { userId: 99, client: 'user' });

      expect(result.data).toHaveLength(0);
      expect(result.meta.totalItems).toBe(0);
    });
  });

  describe('no userInfo (backward compat)', () => {
    it('works without userInfo param (admin behavior)', async () => {
      const { service } = createService([[{ total: 0 }], []]);

      const result = await service.list({}, defaultSort, defaultPagination);

      expect(result.data).toHaveLength(0);
      expect(result.meta.totalItems).toBe(0);
    });
  });

  describe('combined with search filter', () => {
    it('accessible CTE combined with name_matches CTE', async () => {
      const { service, queryMock } = createService([[{ role_id: 3 }], [{ total: 0 }], []]);

      await service.list({ keyword: 'Revenue' }, defaultSort, defaultPagination, { userId: 10, client: 'user' });

      const countSQL = queryMock.mock.calls[1][0] as string;
      // Should have both CTEs
      expect(countSQL).toContain('accessible');
      expect(countSQL).toContain('name_matches');
    });
  });

  // Unscoped path (admin/super_admin) has no accessible CTE, so a data_access
  // rule pointing at a since-deleted target record used to leak through. The
  // EXISTS predicate against the target table (dual-column deleted check) closes
  // that gap. Scoped path is already guarded by the accessible CTE and must NOT
  // duplicate the predicate.
  describe('unscoped path excludes soft-deleted target records', () => {
    it('count + groups SQL carry a target-table EXISTS with dual-column deleted check', async () => {
      const { service, queryMock } = createService([
        [{ total: 0 }], // count
        [], // groups
      ]);

      await service.list({}, defaultSort, defaultPagination, undefined);

      const countSQL = queryMock.mock.calls[0][0] as string;
      expect(countSQL).toContain('EXISTS');
      expect(countSQL).toContain('deleted_at IS NULL');
      expect(countSQL).toContain('is_deleted IS NOT TRUE');
      // Catch-all keeps legacy rules for non-allowed tables visible.
      expect(countSQL).toContain('NOT IN');
    });

    it('scoped path does NOT add the target EXISTS (accessible CTE already guards it)', async () => {
      const { service, queryMock } = createService([
        [{ role_id: 3 }], // roleIds
        [{ total: 0 }], // count
        [], // groups
      ]);

      await service.list({}, defaultSort, defaultPagination, { userId: 10, client: 'user' });

      const countSQL = queryMock.mock.calls[1][0] as string;
      expect(countSQL).toContain('accessible');
      // The unscoped-only EXISTS predicate must not appear here.
      expect(countSQL).not.toContain('NOT IN');
    });
  });
});
