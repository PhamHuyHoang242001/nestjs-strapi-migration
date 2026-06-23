import { OwnerScopeResolverService } from '../services/owner-scope-resolver.service';
import { PermissionCacheService } from '../services/permission-cache.service';
import { RedisAdapter } from '@common/infrastructure/redis.adapter';

jest.mock('@common/infrastructure/redis.adapter');

describe('OwnerScopeResolverService', () => {
  const dsQuery = jest.fn();
  const ds = { query: dsQuery } as any;
  const cache = {
    invalidateOwnerScopeUser: jest.fn().mockResolvedValue(undefined),
    invalidateOwnerScopeByRole: jest.fn().mockResolvedValue(undefined),
    invalidateOwnerScopeAll: jest.fn().mockResolvedValue(undefined),
    getAccessibleRecords: jest.fn(),
  } as unknown as PermissionCacheService;

  let service: OwnerScopeResolverService;

  beforeEach(() => {
    // mockReset() drops queued mockResolvedValueOnce too; clearAllMocks() only clears call history.
    dsQuery.mockReset();
    (RedisAdapter.get as jest.Mock).mockReset();
    (RedisAdapter.set as jest.Mock).mockReset();
    (RedisAdapter.unlinkKeyByPattern as jest.Mock).mockReset();
    (cache.invalidateOwnerScopeUser as jest.Mock).mockClear();
    (cache.invalidateOwnerScopeByRole as jest.Mock).mockClear();
    (cache.invalidateOwnerScopeAll as jest.Mock).mockClear();
    (cache.getAccessibleRecords as jest.Mock).mockReset();
    (RedisAdapter.get as jest.Mock).mockResolvedValue(null);
    (RedisAdapter.set as jest.Mock).mockResolvedValue(undefined);
    (RedisAdapter.unlinkKeyByPattern as jest.Mock).mockResolvedValue([]);
    service = new OwnerScopeResolverService(ds, cache);
  });

  // ── getUserOwnerScope ─────────────────────────────────────────────

  describe('getUserOwnerScope()', () => {
    it('returns single entry for SO with one owned root', async () => {
      dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);

      const result = await service.getUserOwnerScope(100);

      expect(result).toEqual([
        { rootTable: 'bi_hub_bicc_departments', rootId: 1, resourceType: 'bicc_department', roleId: 7 },
      ]);
      expect(dsQuery).toHaveBeenCalledTimes(1);
      expect(dsQuery.mock.calls[0][1]).toEqual([100]);
    });

    it('returns multi-resource entries for SO owning multiple roots of same type', async () => {
      dsQuery.mockResolvedValueOnce([
        { resource_type: 'bicc_department', resource_id: 1, role_id: 7 },
        { resource_type: 'bicc_department', resource_id: 5, role_id: 7 },
      ]);

      const result = await service.getUserOwnerScope(100);

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.rootId).sort()).toEqual([1, 5]);
      expect(result.every((r) => r.rootTable === 'bi_hub_bicc_departments')).toBe(true);
    });

    it('returns entries across multiple services (bicc_department + workspace)', async () => {
      dsQuery.mockResolvedValueOnce([
        { resource_type: 'bicc_department', resource_id: 1, role_id: 7 },
        { resource_type: 'workspace', resource_id: 2, role_id: 8 },
      ]);

      const result = await service.getUserOwnerScope(100);

      expect(result).toHaveLength(2);
      const tables = new Set(result.map((r) => r.rootTable));
      expect(tables).toEqual(new Set(['bi_hub_bicc_departments', 'ma_tool_workspaces']));
    });

    it('returns empty scope for non-SO user', async () => {
      dsQuery.mockResolvedValueOnce([]);

      const result = await service.getUserOwnerScope(100);

      expect(result).toEqual([]);
    });

    it('serves from cache on hit (no DB call)', async () => {
      (RedisAdapter.get as jest.Mock).mockResolvedValueOnce(
        JSON.stringify([
          { rootTable: 'bi_hub_bicc_departments', rootId: 1, resourceType: 'bicc_department', roleId: 7 },
        ]),
      );

      const result = await service.getUserOwnerScope(100);

      expect(result).toHaveLength(1);
      expect(dsQuery).not.toHaveBeenCalled();
    });

    it('warms cache on miss', async () => {
      dsQuery.mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]);

      await service.getUserOwnerScope(100);

      expect(RedisAdapter.set).toHaveBeenCalledWith('perm:user:100:owner_scope', expect.any(String), 120);
    });

    it('skips unknown resource_type rows (drift safety)', async () => {
      dsQuery.mockResolvedValueOnce([
        { resource_type: 'bicc_department', resource_id: 1, role_id: 7 },
        { resource_type: 'unknown_type', resource_id: 9, role_id: 8 },
      ]);

      const result = await service.getUserOwnerScope(100);

      expect(result).toHaveLength(1);
      expect(result[0].resourceType).toBe('bicc_department');
    });
  });

  // ── getUserImpliedVerbs ────────────────────────────────────────────

  describe('getUserImpliedVerbs()', () => {
    it('returns empty set when user has no owner scope', async () => {
      dsQuery.mockResolvedValueOnce([]); // owner scope query

      const result = await service.getUserImpliedVerbs(100);

      expect(result).toEqual(new Set());
      // Only ownerScope query — no verbs query when scope is empty
      expect(dsQuery).toHaveBeenCalledTimes(1);
    });

    it('returns subtree verbs for SO with one owned root', async () => {
      dsQuery
        .mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }])
        .mockResolvedValueOnce([{ code: 'report_view' }, { code: 'report_edit' }, { code: 'diagnostic_view' }]);

      const result = await service.getUserImpliedVerbs(100);

      expect(result).toEqual(new Set(['report_view', 'report_edit', 'diagnostic_view']));
      expect(dsQuery).toHaveBeenCalledTimes(2);
    });

    it('unions verbs across multiple services', async () => {
      dsQuery
        .mockResolvedValueOnce([
          { resource_type: 'bicc_department', resource_id: 1, role_id: 7 },
          { resource_type: 'workspace', resource_id: 2, role_id: 8 },
        ])
        .mockResolvedValueOnce([{ code: 'report_view' }, { code: 'workspace_edit' }, { code: 'document_view' }]);

      const result = await service.getUserImpliedVerbs(100);

      expect(result).toEqual(new Set(['report_view', 'workspace_edit', 'document_view']));
    });

    it('serves verbs from cache on hit', async () => {
      (RedisAdapter.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(['report_view']));

      const result = await service.getUserImpliedVerbs(100);

      expect(result).toEqual(new Set(['report_view']));
      expect(dsQuery).not.toHaveBeenCalled();
    });

    it('excludes root-level create verb from implied set (SO cannot create sibling roots)', async () => {
      dsQuery
        .mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }])
        .mockResolvedValueOnce([
          { code: 'bh_bicc_dept_view' },
          { code: 'bh_bicc_dept_edit' },
          { code: 'bh_bicc_dept_delete' },
          { code: 'bh_report_create' },
        ]);

      const result = await service.getUserImpliedVerbs(100);

      expect(result.has('bh_bicc_dept_create')).toBe(false);
      expect(result.has('bh_report_create')).toBe(true);
      const sql = dsQuery.mock.calls[1][0] as string;
      expect(sql).toMatch(/NOT \(sub\.id = root_mod\.id AND p\.action = 'create'\)/);
    });

    it('warms verbs cache on miss', async () => {
      dsQuery
        .mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }])
        .mockResolvedValueOnce([{ code: 'report_view' }]);

      await service.getUserImpliedVerbs(100);

      expect(RedisAdapter.set).toHaveBeenCalledWith('perm:user:100:owner_verbs', JSON.stringify(['report_view']), 120);
    });
  });

  // ── getOwnedRoots ──────────────────────────────────────────────────

  describe('getOwnedRoots()', () => {
    it('returns empty array when user has no owner scope', async () => {
      dsQuery.mockResolvedValueOnce([]); // owner scope query

      const result = await service.getOwnedRoots(100, 'ma_tool_workspaces');

      expect(result).toEqual([]);
    });

    it('returns root IDs for matching rootTable when user owns multiple workspaces', async () => {
      dsQuery.mockResolvedValueOnce([
        { resource_type: 'workspace', resource_id: 10, role_id: 7 },
        { resource_type: 'workspace', resource_id: 11, role_id: 7 },
      ]);

      const result = await service.getOwnedRoots(100, 'ma_tool_workspaces');

      expect(result).toEqual([10, 11]);
    });

    it('filters to rootTable when user owns mixed services', async () => {
      dsQuery.mockResolvedValueOnce([
        { resource_type: 'workspace', resource_id: 10, role_id: 7 },
        { resource_type: 'bicc_department', resource_id: 1, role_id: 8 },
      ]);

      const result = await service.getOwnedRoots(100, 'ma_tool_workspaces');

      expect(result).toEqual([10]);
    });

    it('returns empty for rootTable that user owns nothing under', async () => {
      dsQuery.mockResolvedValueOnce([{ resource_type: 'workspace', resource_id: 10, role_id: 7 }]);

      const result = await service.getOwnedRoots(100, 'bi_hub_bicc_departments');

      expect(result).toEqual([]);
    });

    it('reuses getUserOwnerScope cache: 2 calls → 1 DB query', async () => {
      dsQuery.mockResolvedValueOnce([{ resource_type: 'workspace', resource_id: 10, role_id: 7 }]);

      await service.getOwnedRoots(100, 'ma_tool_workspaces');
      // Second call hits in-Redis cache; primed during first call's writeCache.
      (RedisAdapter.get as jest.Mock).mockResolvedValueOnce(
        JSON.stringify([{ rootTable: 'ma_tool_workspaces', rootId: 10, resourceType: 'workspace', roleId: 7 }]),
      );
      const result = await service.getOwnedRoots(100, 'ma_tool_workspaces');

      expect(result).toEqual([10]);
      expect(dsQuery).toHaveBeenCalledTimes(1);
    });
  });

  // ── isInOwnedScope ─────────────────────────────────────────────────

  describe('isInOwnedScope()', () => {
    it('returns false when user has no owner scope', async () => {
      dsQuery.mockResolvedValueOnce([]); // owner scope

      const result = await service.isInOwnedScope(100, 'bi_hub_reports', 42);

      expect(result).toBe(false);
    });

    it('returns false when table is unknown to HIERARCHY_MAP', async () => {
      // Unknown table short-circuits before any DB call.
      const result = await service.isInOwnedScope(100, 'unknown_table', 42);

      expect(result).toBe(false);
      expect(dsQuery).not.toHaveBeenCalled();
    });

    it('returns true when leaf record walks up to owned root', async () => {
      dsQuery
        .mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }])
        .mockResolvedValueOnce([{ exists: 1 }]); // walk-up check returns 1 row

      const result = await service.isInOwnedScope(100, 'bi_hub_reports', 42);

      expect(result).toBe(true);
    });

    it('returns false when leaf record root is not in user owned set', async () => {
      dsQuery
        .mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }])
        .mockResolvedValueOnce([]); // walk-up check returns no rows

      const result = await service.isInOwnedScope(100, 'bi_hub_reports', 999);

      expect(result).toBe(false);
    });

    it('returns true when checking the root table itself with owned id', async () => {
      dsQuery
        .mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }])
        .mockResolvedValueOnce([{ exists: 1 }]);

      const result = await service.isInOwnedScope(100, 'bi_hub_bicc_departments', 1);

      expect(result).toBe(true);
    });
  });

  // ── canCreateUnderParent ───────────────────────────────────────────

  describe('canCreateUnderParent()', () => {
    const PARENT_TABLE = 'bi_hub_bicc_departments';
    const PERMISSION = 'bh_diag_report_create';

    it('returns true on explicit accessible-records hit and does NOT call SO path', async () => {
      (cache.getAccessibleRecords as jest.Mock).mockResolvedValueOnce([3, 5, 9]);
      const soSpy = jest.spyOn(service, 'isInOwnedScope');

      const result = await service.canCreateUnderParent(100, PARENT_TABLE, 5, PERMISSION);

      expect(result).toBe(true);
      expect(cache.getAccessibleRecords).toHaveBeenCalledWith(100, PARENT_TABLE, PERMISSION);
      expect(soSpy).not.toHaveBeenCalled();
    });

    it('falls through to SO path on explicit miss and returns true when owned', async () => {
      (cache.getAccessibleRecords as jest.Mock).mockResolvedValueOnce([]);
      const soSpy = jest.spyOn(service, 'isInOwnedScope').mockResolvedValueOnce(true);

      const result = await service.canCreateUnderParent(100, PARENT_TABLE, 7, PERMISSION);

      expect(result).toBe(true);
      expect(soSpy).toHaveBeenCalledWith(100, PARENT_TABLE, 7);
    });

    it('returns false when both explicit and SO paths miss', async () => {
      (cache.getAccessibleRecords as jest.Mock).mockResolvedValueOnce([]);
      jest.spyOn(service, 'isInOwnedScope').mockResolvedValueOnce(false);

      const result = await service.canCreateUnderParent(100, PARENT_TABLE, 7, PERMISSION);

      expect(result).toBe(false);
    });

    it('counts user-level allow grants (same accessible-records primitive)', async () => {
      // getAccessibleRecords unions role + user allow grants upstream; a user-grant-only
      // parent appears here the same way a role-bound one does.
      (cache.getAccessibleRecords as jest.Mock).mockResolvedValueOnce([7]);
      const soSpy = jest.spyOn(service, 'isInOwnedScope');

      const result = await service.canCreateUnderParent(100, PARENT_TABLE, 7, PERMISSION);

      expect(result).toBe(true);
      expect(soSpy).not.toHaveBeenCalled();
    });

    it('treats deny-subtracted parent as explicit miss, then defers to SO', async () => {
      // Denied parent is removed from accessible records upstream → [] here.
      (cache.getAccessibleRecords as jest.Mock).mockResolvedValueOnce([]);
      jest.spyOn(service, 'isInOwnedScope').mockResolvedValueOnce(false);

      const result = await service.canCreateUnderParent(100, PARENT_TABLE, 42, PERMISSION);

      expect(result).toBe(false);
    });

    it('returns false for non-finite parentId without hitting any path', async () => {
      const soSpy = jest.spyOn(service, 'isInOwnedScope');

      const result = await service.canCreateUnderParent(100, PARENT_TABLE, Number.NaN, PERMISSION);

      expect(result).toBe(false);
      expect(cache.getAccessibleRecords).not.toHaveBeenCalled();
      expect(soSpy).not.toHaveBeenCalled();
    });

    it('exercises real SO SQL path on explicit miss (no over-mocking)', async () => {
      (cache.getAccessibleRecords as jest.Mock).mockResolvedValueOnce([]);
      dsQuery
        .mockResolvedValueOnce([{ resource_type: 'bicc_department', resource_id: 1, role_id: 7 }]) // owner scope
        .mockResolvedValueOnce([{ exists: 1 }]); // walk-up: parent is owned root

      const result = await service.canCreateUnderParent(100, PARENT_TABLE, 1, PERMISSION);

      expect(result).toBe(true);
    });
  });

  // ── invalidation ──────────────────────────────────────────────────

  describe('invalidate*()', () => {
    it('invalidateUser delegates to cache', async () => {
      await service.invalidateUser(7);
      expect(cache.invalidateOwnerScopeUser).toHaveBeenCalledWith(7);
    });

    it('invalidateRole delegates to cache', async () => {
      await service.invalidateRole(3);
      expect(cache.invalidateOwnerScopeByRole).toHaveBeenCalledWith(3);
    });

    it('invalidateGlobal delegates to cache', async () => {
      await service.invalidateGlobal();
      expect(cache.invalidateOwnerScopeAll).toHaveBeenCalled();
    });
  });
});
