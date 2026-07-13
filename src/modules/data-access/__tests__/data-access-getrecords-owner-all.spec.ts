import { DataAccessService } from '../data-access.service';
import { DataAccessRepository } from '../repository/data-access.repository';
import { HierarchyValidationService } from '../hierarchy-validation.service';
import { ChangeHistoryLogger } from '@modules/change-history/change-history-logger.service';
import { PermissionCacheService } from '@common/authorization';
import { RecordPathService } from '../services/record-path.service';
import { DataSource, Repository } from 'typeorm';
import { PaginationParams } from '@common/decorators/pagination.decorator';

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

    const result = await service.getRecords(TABLE, {}, defaultPagination, { userId: 10, client: 'user' });

    expect(result.data).toHaveLength(2);
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

    const result = await service.getRecords(TABLE, {}, defaultPagination, { userId: 10, client: 'user' });

    expect(result.data).toHaveLength(0);
    expect(result.meta.totalItems).toBe(0);
    // Stops after the ownership probe — no count/data queries.
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('returns EMPTY for a user with no roles (before any ownership probe)', async () => {
    const { service, queryMock } = createService([[]]); // no roles

    const result = await service.getRecords(TABLE, {}, defaultPagination, { userId: 99, client: 'user' });

    expect(result.data).toHaveLength(0);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('still returns empty for owner-config-pending tables (bi_payment_projects)', async () => {
    const { service, queryMock } = createService([[{ role_id: 3 }]]);

    const result = await service.getRecords('bi_payment_projects', {}, defaultPagination, {
      userId: 10,
      client: 'user',
    });

    expect(result.data).toHaveLength(0);
    // Only the role lookup ran — bi_payment is not own-all and has no owner config.
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
