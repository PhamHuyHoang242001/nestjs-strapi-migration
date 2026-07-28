import { PermissionCacheService } from '@common/authorization';
import { ChangeHistoryLogger } from '@modules/change-history/change-history-logger.service';
import { DataSource, Repository } from 'typeorm';
import { PaginationParams } from '@common/decorators/pagination.decorator';
import { SortParams } from '@common/decorators/sort.decorator';
import { DataAccessService } from '../data-access.service';
import { DataAccessRepository } from '../repository/data-access.repository';
import { HierarchyValidationService } from '../hierarchy-validation.service';
import { RecordPathService } from '../services/record-path.service';

const DIAG = 'bi_hub_diagnostic_reports';

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
    { findOne: jest.fn().mockResolvedValue({ type: 'user' }) } as unknown as Repository<any>,
  );
  return { service, queryMock, getEditAccessibleRecordIds };
}

const sort: SortParams = { sort_field: 'created_at', sort_order: 'DESC' as any };
const page: PaginationParams = { page: 1, limit: 20, skip: 0 };
const groupRow = {
  data_id: 55,
  module_id: 8,
  table_name: DIAG,
  module_path: '/Diag',
  module_name: 'Diag',
  latest_created_at: '2026-01-01',
};

describe('DataAccessService.list() — edit-scope (manage-enabled tables)', () => {
  it('editor with edit-on-record + view-verb → edit branch OR-ed into the scoped where clause', async () => {
    const { service, queryMock, getEditAccessibleRecordIds } = createService({
      editIds: [55],
      queryResults: [
        [{ role_id: 3 }], // roleIds
        [{ total: 1 }], // count
        [groupRow], // groups
        [], // rules
        [], // record names
      ],
    });

    await service.list({}, sort, page, { id: 10 }, 'user');

    expect(getEditAccessibleRecordIds).toHaveBeenCalledWith(
      { userId: 10, client: 'user', isSuperAdmin: false },
      DIAG,
      'perm_data_access_view',
    );
    const countSQL = queryMock.mock.calls[1][0] as string;
    expect(countSQL).toContain('accessible');
    expect(countSQL).toContain(`(m.table_name = '${DIAG}' AND da.data_id IN (55))`);
    expect(countSQL).toContain(' OR ');
  });

  it('editor with edit-on-record but NO roles → still scoped via the edit branch (no accessible CTE)', async () => {
    const { service, queryMock } = createService({
      editIds: [55],
      queryResults: [
        [], // roleIds → none
        [{ total: 1 }], // count
        [groupRow], // groups
        [], // rules
        [], // record names
      ],
    });

    await service.list({}, sort, page, { id: 10 }, 'user');

    const countSQL = queryMock.mock.calls[1][0] as string;
    expect(countSQL).toContain(`(m.table_name = '${DIAG}' AND da.data_id IN (55))`);
    expect(countSQL).not.toContain('accessible');
  });

  it('caller with no roles AND no edit access → empty result, no group query', async () => {
    const { service, queryMock } = createService({
      editIds: [],
      queryResults: [[]], // roleIds → none
    });

    const res = await service.list({}, sort, page, { id: 10 }, 'user');

    expect(res.data).toEqual([]);
    expect(res.meta.totalItems).toBe(0);
    expect(queryMock).toHaveBeenCalledTimes(1); // only the roleIds lookup
  });

  it('editor missing view-verb (getEditAccessibleRecordIds returns []) → no edit branch', async () => {
    const { service, queryMock } = createService({
      editIds: [], // helper already folds the view-verb check → empty
      queryResults: [
        [{ role_id: 3 }], // roleIds
        [{ total: 0 }], // count
        [], // groups → empty
      ],
    });

    await service.list({}, sort, page, { id: 10 }, 'user');

    const countSQL = queryMock.mock.calls[1][0] as string;
    expect(countSQL).toContain('accessible');
    expect(countSQL).not.toContain(`da.data_id IN (`);
  });
});
