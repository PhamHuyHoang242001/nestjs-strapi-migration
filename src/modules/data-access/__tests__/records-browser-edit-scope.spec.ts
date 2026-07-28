import { PermissionCacheService } from '@common/authorization';
import { ChangeHistoryLogger } from '@modules/change-history/change-history-logger.service';
import { DataSource, Repository } from 'typeorm';
import { PaginationParams } from '@common/decorators/pagination.decorator';
import { DataAccessService } from '../data-access.service';
import { DataAccessRepository } from '../repository/data-access.repository';
import { HierarchyValidationService } from '../hierarchy-validation.service';
import { RecordPathService } from '../services/record-path.service';
import { UserType } from '@modules/databases/user.entity';

const DIAG = 'bi_hub_diagnostic_reports';
const page: PaginationParams = { page: 1, limit: 20, skip: 0 };

function createService(opts: { queryResults: any[]; editIds?: number[] }) {
  let callIndex = 0;
  const queryMock = jest.fn((..._args: any[]) => Promise.resolve(opts.queryResults[callIndex++] ?? []));
  const dataSource = { query: queryMock, transaction: jest.fn() } as unknown as DataSource;

  const getEditAccessibleRecordIds = jest.fn().mockResolvedValue(opts.editIds ?? []);
  const manageAuthority = {
    canManageRecord: jest.fn().mockResolvedValue(true),
    filterManageableRecords: jest.fn().mockResolvedValue([]),
    getEditAccessibleRecordIds,
  } as any;

  const service = new DataAccessService(
    {} as DataAccessRepository,
    dataSource,
    {} as HierarchyValidationService,
    { log: jest.fn().mockResolvedValue(undefined) } as unknown as ChangeHistoryLogger,
    { invalidateByTable: jest.fn(), invalidateUser: jest.fn() } as unknown as PermissionCacheService,
    { buildPath: jest.fn().mockResolvedValue('ID: 0') } as unknown as RecordPathService,
    {} as unknown as Repository<any>,
    {} as unknown as Repository<any>,
    {} as unknown as Repository<any>,
    manageAuthority,
    // Inline caller block resolves isSuperAdmin from the users row: id 1 = super_admin,
    // everyone else non-super.
    {
      findOne: jest.fn(({ where }: { where: { id: number } }) =>
        Promise.resolve({ id: where.id, type: where.id === 1 ? UserType.SUPER_ADMIN : 'staff' }),
      ),
    } as unknown as Repository<any>,
  );
  return { service, queryMock, getEditAccessibleRecordIds };
}

describe('Records browser — edit-scope (manage-enabled tables)', () => {
  it('editor with edit-on-record ∧ create-verb → record listed via id allow-list', async () => {
    const { service, queryMock, getEditAccessibleRecordIds } = createService({
      editIds: [55],
      queryResults: [
        [], // roleIds lookup → none (owner scope off, edit-grant branch only)
        [{ total: 1 }], // count
        [{ id: 55, display_name: 'Report 55', created_at: '2026-01-01' }], // data
      ],
    });

    const res = await service.getRecords(DIAG, {}, page, { id: 10 }, 'user');

    expect(getEditAccessibleRecordIds).toHaveBeenCalledWith(
      { userId: 10, client: 'user', isSuperAdmin: false },
      DIAG,
      'perm_data_access_create',
    );
    expect(res.data).toHaveLength(1);
    const dataSQL = queryMock.mock.calls[2][0] as string;
    const dataParams = queryMock.mock.calls[2][1] as any[];
    // Edit grants are an explicit (bounded) id allow-list; owner scope is off (no roles).
    expect(dataSQL).toContain('id = ANY(');
    expect(dataSQL).not.toContain('EXISTS (');
    expect(dataParams).toContainEqual([55]);
  });

  it('editor lacking create-verb (no edit ids) and not owner → empty, no count/data query', async () => {
    const { service, queryMock } = createService({
      editIds: [],
      queryResults: [[]], // roleIds lookup → none
    });

    const res = await service.getRecords(DIAG, {}, page, { id: 10 }, 'user');

    expect(res.data).toEqual([]);
    expect(res.meta.totalItems).toBe(0);
    expect(queryMock).toHaveBeenCalledTimes(1); // only the roleIds lookup; no branch to query
  });

  it('SO owner without an explicit edit grant → owner scope via correlated EXISTS (no id list)', async () => {
    const { service, queryMock } = createService({
      editIds: [],
      queryResults: [
        [{ role_id: 3 }], // roleIds lookup → owner scope on
        [{ total: 1 }], // count
        [{ id: 77, display_name: 'Owned 77', created_at: '2026-01-01' }], // data
      ],
    });

    const res = await service.getRecords(DIAG, {}, page, { id: 10 }, 'user');

    expect(res.data).toHaveLength(1);
    // Owner scope stays in-DB: no owner-id array is materialized, pagination pushes to SQL.
    const dataSQL = queryMock.mock.calls[2][0] as string;
    const dataParams = queryMock.mock.calls[2][1] as any[];
    expect(dataSQL).toContain('EXISTS (');
    expect(dataSQL).toContain('resource_owners');
    expect(dataSQL).toMatch(/LIMIT \$\d+ OFFSET \$\d+/);
    expect(dataParams).toContainEqual([3]); // roleIds bound for the owner join
    // No edit-grant branch (no explicit grants), so no outer id allow-list.
    expect(dataSQL).not.toContain('m.id = ANY(');
  });

  it('super_admin → broad (unscoped, no id allow-list)', async () => {
    const { service, queryMock, getEditAccessibleRecordIds } = createService({
      queryResults: [
        [{ total: 2 }], // count (unscoped)
        [
          { id: 1, display_name: 'A', created_at: '2026-01-01' },
          { id: 2, display_name: 'B', created_at: '2026-01-02' },
        ],
      ],
    });

    const res = await service.getRecords(DIAG, {}, page, { id: 1 }, 'user');

    expect(res.data).toHaveLength(2);
    expect(getEditAccessibleRecordIds).not.toHaveBeenCalled();
    const dataSQL = queryMock.mock.calls[1][0] as string;
    expect(dataSQL).not.toContain('id = ANY(');
  });
});
