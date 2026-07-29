import { DataAccessService } from '../data-access.service';
import { DataAccessRepository } from '../repository/data-access.repository';
import { HierarchyValidationService } from '../hierarchy-validation.service';
import { ChangeHistoryLogger } from '@modules/change-history/change-history-logger.service';
import { PermissionCacheService } from '@common/authorization';
import { RecordPathService } from '../services/record-path.service';
import { DataSource, Repository } from 'typeorm';
import { PaginationParams } from '@common/decorators/pagination.decorator';
import { UserType } from '@modules/databases/user.entity';

// ── Mock factory (mirrors data-access-getrecords-scoped.spec.ts) ──────────────
function createService(queryResults: any[]) {
  let callIndex = 0;
  const queryMock = jest.fn((..._args: any[]) => {
    const result = queryResults[callIndex] ?? [];
    callIndex++;
    return Promise.resolve(result);
  });

  const mockDataSource = { query: queryMock, transaction: jest.fn() } as unknown as DataSource;
  const service = new DataAccessService(
    {} as DataAccessRepository,
    mockDataSource,
    {} as HierarchyValidationService,
    { log: jest.fn().mockReturnValue(Promise.resolve()) } as unknown as ChangeHistoryLogger,
    {
      invalidateByTable: jest.fn().mockReturnValue(Promise.resolve()),
      invalidateUser: jest.fn().mockReturnValue(Promise.resolve()),
    } as unknown as PermissionCacheService,
    { buildPath: jest.fn().mockResolvedValue('ID: 0') } as unknown as RecordPathService,
    {} as unknown as Repository<any>,
    {} as unknown as Repository<any>,
    {} as unknown as Repository<any>,
    { canManageRecord: jest.fn().mockResolvedValue(true), filterManageableRecords: jest.fn().mockResolvedValue([]), getEditAccessibleRecordIds: jest.fn().mockResolvedValue([]) } as any,
    // Inline caller block resolves isSuperAdmin from the users row: id 1 = super_admin,
    // everyone else non-super.
    {
      findOne: jest.fn(({ where }: { where: { id: number } }) =>
        Promise.resolve({ id: where.id, type: where.id === 1 ? UserType.SUPER_ADMIN : 'staff' }),
      ),
    } as unknown as Repository<any>,
  );

  return { service, queryMock };
}

const defaultPagination: PaginationParams = { page: 1, limit: 20, skip: 0 };
const TABLE = 'ma_tool_cstb_rpt_properties';

// getScopedRecords query order for an own-all table:
//   [0] role IDs, [1] sentinel-ownership probe, then (if owner) [2] count, [3] data.
describe('DataAccessService.getRecords() — whole-table SO (own-all)', () => {
  it('lists ALL rows when the caller role holds the sentinel SO row', async () => {
    const { service, queryMock } = createService([
      [{ role_id: 3 }], // [0] role IDs
      [{ '?column?': 1 }], // [1] sentinel probe → owner
      [{ total: 2 }], // [2] count (unscoped)
      [
        { id: 1, display_name: 'RPT-A', created_at: '2026-01-01' },
        { id: 2, display_name: 'RPT-B', created_at: '2026-01-02' },
      ],
    ]);

    const result = await service.getRecords(TABLE, {}, defaultPagination, { id: 10 }, 'user');

    expect(result.data).toHaveLength(2);
    expect(result.data[0]).not.toHaveProperty('record_path');
    expect(result.data[0]).not.toHaveProperty('record_extra');
    expect(result.meta.totalItems).toBe(2);
    // Ownership probe hit resource_owners with the sentinel resource_id.
    const probeSQL = queryMock.mock.calls[1][0] as string;
    const probeParams = queryMock.mock.calls[1][1] as any[];
    expect(probeSQL).toContain('resource_owners');
    expect(probeParams).toContain('ma_tool_report');
    expect(probeParams).toContain(0); // OWNER_ALL_RESOURCE_ID sentinel
    // Data query is the plain unscoped list — no owner join.
    const dataSQL = queryMock.mock.calls[3][0] as string;
    expect(dataSQL).toContain('rpt_code as display_name');
    expect(dataSQL).not.toContain('resource_owners');
  });

  it('returns EMPTY when the caller role does NOT hold the sentinel SO row', async () => {
    const { service, queryMock } = createService([
      [{ role_id: 3 }], // role IDs
      [], // sentinel probe → not an owner
    ]);

    const result = await service.getRecords(TABLE, {}, defaultPagination, { id: 10 }, 'user');

    expect(result.data).toHaveLength(0);
    expect(result.meta.totalItems).toBe(0);
    // Stops after the ownership probe — no count/data queries.
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('returns EMPTY for a user with no roles (before any ownership probe)', async () => {
    const { service, queryMock } = createService([[]]); // no roles

    const result = await service.getRecords(TABLE, {}, defaultPagination, { id: 99 }, 'user');

    expect(result.data).toHaveLength(0);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('super_admin lists ALL rows on an own-all table without the role/sentinel probe', async () => {
    // Admin-sees-all short-circuits in getRecords before scope branching: no role lookup,
    // no sentinel ownership probe — straight to the unscoped count + data queries.
    const { service, queryMock } = createService([
      [{ total: 2 }], // [0] count (unscoped)
      [
        { id: 1, display_name: 'RPT-A', created_at: '2026-01-01' },
        { id: 2, display_name: 'RPT-B', created_at: '2026-01-02' },
      ],
    ]);

    const result = await service.getRecords(TABLE, {}, defaultPagination, { id: 1 }, 'user');

    expect(result.data).toHaveLength(2);
    expect(result.meta.totalItems).toBe(2);
    // Only count + data ran — the role lookup and sentinel probe were skipped.
    expect(queryMock).toHaveBeenCalledTimes(2);
    const countSQL = queryMock.mock.calls[0][0] as string;
    expect(countSQL).not.toContain('resource_owners');
    const dataSQL = queryMock.mock.calls[1][0] as string;
    expect(dataSQL).toContain('rpt_code as display_name');
    expect(dataSQL).not.toContain('resource_owners');
  });

  it('returns records for a rule-target table with full owner-config cascade (bi_payment_projects)', async () => {
    // bi_payment_projects is a rule target: the scoped path runs the role lookup,
    // then the owner-config JOIN chain (project → bicc_department → resource_owners).
    const { service, queryMock } = createService([
      [{ role_id: 3 }], // role lookup
      [{ total: 1 }], // count
      [{ id: 42, display_name: 'Project Alpha', created_at: '2026-01-01' }], // data
    ]);

    const result = await service.getRecords('bi_payment_projects', {}, defaultPagination, { id: 10 }, 'user');

    expect(result.data).toHaveLength(1);
    // role lookup + count + data = 3 queries (not the old 1 — project is now owned).
    expect(queryMock).toHaveBeenCalledTimes(3);
  });
});
