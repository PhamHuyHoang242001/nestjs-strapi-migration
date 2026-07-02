import { BadRequestException } from '@nestjs/common';
import { RoleService } from '../role.service';

// Mock dependencies
const mockQuery = jest.fn();
const mockConnection = { query: mockQuery, getRepository: jest.fn(), transaction: jest.fn() };
const mockRoleRepo = { findDetailRelationWithModule: jest.fn(), findOneByCondition: jest.fn(), save: jest.fn() };
const mockUserRepo = {};
const mockPermRepo = { findByIds: jest.fn().mockResolvedValue([]) };
const mockHistoryLogger = { log: jest.fn().mockReturnValue({ catch: jest.fn() }) };
const mockPermissionCache = {
  invalidateByRole: jest.fn().mockReturnValue({ catch: jest.fn() }),
  invalidateUser: jest.fn().mockReturnValue({ catch: jest.fn() }),
  invalidateOwnerScopeByRole: jest.fn().mockReturnValue({ catch: jest.fn() }),
};

function createService() {
  return new RoleService(
    mockRoleRepo as any,
    mockUserRepo as any,
    mockPermRepo as any,
    mockConnection as any,
    mockHistoryLogger as any,
    mockPermissionCache as any,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── listOwnerResources ────────────────────────────────────────────

describe('listOwnerResources()', () => {
  it('returns data for valid root table (ma_tool_workspaces)', async () => {
    const service = createService();
    mockQuery.mockResolvedValueOnce([{ total: 2 }]).mockResolvedValueOnce([
      { id: 1, display_name: 'WS A' },
      { id: 2, display_name: 'WS B' },
    ]);

    const result = await service.listOwnerResources('ma_tool_workspaces', {}, { page: 1, limit: 20, skip: 0 });

    expect(result.data).toHaveLength(2);
    expect(result.meta.totalItems).toBe(2);
  });

  it('returns data for bi_hub_bicc_departments', async () => {
    const service = createService();
    mockQuery.mockResolvedValueOnce([{ total: 1 }]).mockResolvedValueOnce([{ id: 10, display_name: 'Dept A' }]);

    const result = await service.listOwnerResources('bi_hub_bicc_departments', {}, { page: 1, limit: 20, skip: 0 });

    expect(result.data).toHaveLength(1);
    expect(result.meta.totalItems).toBe(1);
  });

  it('throws BadRequestException for non-owner-root table', async () => {
    const service = createService();

    await expect(
      service.listOwnerResources('bi_payment_projects', {}, { page: 1, limit: 20, skip: 0 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException for unknown table', async () => {
    const service = createService();

    await expect(service.listOwnerResources('invalid_table', {}, { page: 1, limit: 20, skip: 0 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('applies keyword filter in query', async () => {
    const service = createService();
    mockQuery.mockResolvedValueOnce([{ total: 1 }]).mockResolvedValueOnce([{ id: 1, display_name: 'Matching' }]);

    await service.listOwnerResources('ma_tool_workspaces', { keyword: 'test' }, { page: 1, limit: 20, skip: 0 });

    const countSQL = mockQuery.mock.calls[0][0] as string;
    expect(countSQL).toContain('ILIKE');
    expect(mockQuery.mock.calls[0][1]).toContain('%test%');
  });

  it('respects pagination params', async () => {
    const service = createService();
    mockQuery.mockResolvedValueOnce([{ total: 50 }]).mockResolvedValueOnce([]);

    const result = await service.listOwnerResources('ma_tool_workspaces', {}, { page: 3, limit: 10, skip: 20 });

    expect(result.meta.currentPage).toBe(3);
    expect(result.meta.itemsPerPage).toBe(10);
    expect(result.meta.totalPages).toBe(5);
    // Offset should be (3-1)*10 = 20
    const dataParams = mockQuery.mock.calls[1][1];
    expect(dataParams).toContain(20); // offset
  });
});

// ── saveOwnerAssignments ──────────────────────────────────────────

describe('saveOwnerAssignments()', () => {
  it('soft-deletes old and inserts new assignments', async () => {
    const service = createService();
    mockQuery.mockResolvedValue([]);

    await service.saveOwnerAssignments(99, [{ resource_type: 'workspace', resource_ids: [1, 3] }]);

    // First call: soft-delete old
    expect(mockQuery.mock.calls[0][0]).toContain('UPDATE resource_owners SET deleted_at');
    expect(mockQuery.mock.calls[0][1]).toEqual([99]);

    // Second call: insert new
    expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO resource_owners');
    expect(mockQuery.mock.calls[1][1]).toContain('workspace');
    expect(mockQuery.mock.calls[1][1]).toContain(1);
    expect(mockQuery.mock.calls[1][1]).toContain(3);
  });

  it('handles multiple resource types', async () => {
    const service = createService();
    mockQuery.mockResolvedValue([]);

    await service.saveOwnerAssignments(99, [
      { resource_type: 'workspace', resource_ids: [1] },
      { resource_type: 'bicc_department', resource_ids: [2] },
    ]);

    const insertParams = mockQuery.mock.calls[1][1];
    expect(insertParams).toContain('workspace');
    expect(insertParams).toContain('bicc_department');
  });

  it('throws for invalid resource_type', async () => {
    const service = createService();

    await expect(
      service.saveOwnerAssignments(99, [{ resource_type: 'invalid_type', resource_ids: [1] }]),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts the whole-table ma_tool_report SO with the sentinel resource_id', async () => {
    const service = createService();
    mockQuery.mockResolvedValue([]);

    await service.saveOwnerAssignments(99, [{ resource_type: 'ma_tool_report', resource_ids: [0] }]);

    expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO resource_owners');
    expect(mockQuery.mock.calls[1][1]).toContain('ma_tool_report');
    expect(mockQuery.mock.calls[1][1]).toContain(0); // sentinel = whole-table ownership
  });

  it('clears all SO (soft-delete, no insert) when assignments is an empty array', async () => {
    const service = createService();
    mockQuery.mockResolvedValue([]);

    await service.saveOwnerAssignments(99, []);

    // Empty array = explicit "remove all SO" → soft-delete MUST run.
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain('UPDATE resource_owners SET deleted_at');
    expect(mockQuery.mock.calls[0][1]).toEqual([99]);
    expect(mockPermissionCache.invalidateOwnerScopeByRole).toHaveBeenCalledWith(99);
  });

  it('only soft-deletes when resource_ids are empty', async () => {
    const service = createService();
    mockQuery.mockResolvedValue([]);

    await service.saveOwnerAssignments(99, [{ resource_type: 'workspace', resource_ids: [] }]);

    // Only soft-delete call, no insert
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain('UPDATE resource_owners SET deleted_at');
  });
});

// ── details with owner_assignments ────────────────────────────────

describe('details() includes owner_assignments', () => {
  it('returns owner_assignments grouped by resource_type', async () => {
    const service = createService();
    mockRoleRepo.findDetailRelationWithModule.mockResolvedValue({
      id: 1,
      name: 'Test Role',
      permissions: [],
    });
    mockQuery.mockResolvedValue([
      { resource_type: 'workspace', resource_id: 1 },
      { resource_type: 'workspace', resource_id: 3 },
      { resource_type: 'bicc_department', resource_id: 2 },
    ]);

    const result = await service.details(1);

    expect(result.owner_assignments).toEqual([
      { resource_type: 'workspace', resource_ids: [1, 3] },
      { resource_type: 'bicc_department', resource_ids: [2] },
    ]);
  });

  it('returns empty array when no owner_assignments', async () => {
    const service = createService();
    mockRoleRepo.findDetailRelationWithModule.mockResolvedValue({
      id: 1,
      name: 'Test Role',
      permissions: [],
    });
    mockQuery.mockResolvedValue([]);

    const result = await service.details(1);

    expect(result.owner_assignments).toEqual([]);
  });
});
