import { DataHubUserRefService } from '../../common/data-hub-user-ref.service';
import { DataHubDataServiceDetailQueryService } from '../data-hub-data-service-detail-query.service';
import { DataHubDataServiceExportService, safeCell } from '../data-hub-data-service-export.service';
import { DataHubDataServiceHistoryService } from '../data-hub-data-service-history.service';
import { DataHubDataServiceListQueryService } from '../data-hub-data-service-list-query.service';
import { DataHubDataServiceTermsQueryService } from '../data-hub-data-service-terms-query.service';
import { buildListWhere } from '../data-service-list-filter.util';

type Handler = [RegExp, unknown];

function makeDataSource(handlers: Handler[]) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = jest.fn((sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const hit = handlers.find(([re]) => re.test(sql));
    return Promise.resolve(hit ? hit[1] : []);
  });
  const dataSource = { query, manager: { query } };
  return { dataSource, calls };
}

const listRow = {
  id: 1,
  service_code: 'API-FIN-001',
  service_type: 'API',
  status: 'active',
  updated_at: new Date('2026-01-02T03:04:00Z'),
  version_id: 11,
  version_no: 2,
  name: 'Svc',
  short_description: 'd',
  division_id: 1,
  division_code: 'FIN',
  division_name: 'Finance',
  department_id: 2,
  department_code: 'D1',
  department_name: 'Dept',
  request_unit_id: 3,
  request_unit_code: 'RU',
  request_unit_name: 'Req',
  method: 'GET',
  endpoint_path: '/v1/x',
  base_url: 'API_INT',
  update_frequency: 'REALTIME',
  flow_direction: null,
  export_frequency: null,
  file_format: null,
  sftp_folder_path: null,
};

const ACTIVE_CONSUMER = "c.deleted_at IS NULL AND c.is_deleted IS NOT TRUE AND c.status = 'active'";

const noStar = (sql: string) => expect(sql).not.toMatch(/SELECT\s+\*|\.\*|,\s*\*/);

describe('buildListWhere', () => {
  it('consumer filter only matches active, live consumers', () => {
    const { where } = buildListWhere({ consumer_ids: [7] } as never);
    expect(where).toContain('JOIN data_hub_consumers fcc ON fcc.id = fc.consumer_id');
    expect(where).toContain("fcc.deleted_at IS NULL AND fcc.is_deleted IS NOT TRUE AND fcc.status = 'active'");
  });

  it('defaults to active live packages and binds every filter value', () => {
    const { where, params } = buildListWhere({
      keyword: "50%_'; DROP",
      service_type: 'API',
      methods: ['GET'],
      division_ids: [1, 2],
      consumer_ids: [9],
      logical_term_ids: [4],
      physical_term_ids: [5],
      ids: [7],
    } as never);
    expect(where).toContain('s.deleted_at IS NULL');
    expect(where).toContain('s.status = $1');
    expect(params[0]).toBe('active');
    expect(where).not.toContain('DROP');
    expect(params).toContain("%50\\%\\_'; DROP%");
    expect(params).toEqual(expect.arrayContaining(['API', ['GET'], [1, 2], [9], [4], [5], [7]]));
    expect(new Set(where.match(/\$\d+/g)).size).toBe(params.length);
  });

  it('status=all drops the status condition', () => {
    const { where, params } = buildListWhere({ status: 'all' } as never);
    expect(where).not.toContain('s.status');
    expect(params).toEqual([]);
  });
});

const listService = (dataSource: unknown) =>
  new DataHubDataServiceListQueryService(dataSource as never, new DataHubUserRefService(dataSource as never));

describe('DataHubDataServiceListQueryService', () => {
  it('selects explicit columns, batches consumers + term counts, maps the item shape', async () => {
    const { dataSource, calls } = makeDataSource([
      [/COUNT\(\*\)::int AS total/, [{ total: 1 }]],
      [/SELECT\s+s\.id, s\.service_code/, [listRow]],
      [/FROM data_hub_data_service_version_consumers/, [{ version_id: 11, id: 5, code: 'APP1', name: 'App 1' }]],
      [/FROM data_hub_data_service_version_physical_terms/, [{ version_id: 11, term_count: 3 }]],
      [
        /FROM data_hub_data_service_version_service_owners/,
        [
          { version_id: 11, user_id: 8 },
          { version_id: 11, user_id: 7 },
        ],
      ],
      [/SELECT id, email FROM users/, [{ id: 7, email: 'so@x.vn' }]],
    ]);
    const service = listService(dataSource);
    const result = await service.list({ page: 2, limit: 10 } as never);

    expect(result.meta).toEqual({ total: 1, page: 2, limit: 10 });
    expect(result.data[0]).toEqual({
      id: 1,
      service_code: 'API-FIN-001',
      service_type: 'API',
      status: 'active',
      version_no: 2,
      name: 'Svc',
      short_description: 'd',
      division: { id: 1, code: 'FIN', name: 'Finance' },
      department: { id: 2, code: 'D1', name: 'Dept' },
      request_unit: { id: 3, code: 'RU', name: 'Req' },
      method: 'GET',
      endpoint_path: '/v1/x',
      flow_direction: null,
      frequency: 'REALTIME',
      file_format: null,
      consumers: [{ id: 5, code: 'APP1', name: 'App 1' }],
      // SO dịch vụ in link order; an unknown user still shows its id
      service_owners: [
        { id: 8, email: null },
        { id: 7, email: 'so@x.vn' },
      ],
      term_count: 3,
      updated_at: listRow.updated_at,
    });
    calls.forEach((c) => noStar(c.sql));
    // one query per relation for the whole page, never per row
    expect(calls.filter((c) => /version_consumers/.test(c.sql))).toHaveLength(1);
    expect(calls.filter((c) => /version_physical_terms/.test(c.sql))).toHaveLength(1);
    expect(calls.filter((c) => /version_service_owners/.test(c.sql))).toHaveLength(1);
    // inactive / soft-deleted consumers are not listed on a service row (also feeds the export)
    expect(calls.find((c) => /version_consumers/.test(c.sql)).sql).toContain(ACTIVE_CONSUMER);
    // a deleted physical term is not counted toward term_count (terms have no status)
    expect(calls.find((c) => /version_physical_terms/.test(c.sql)).sql).toContain('pt.deleted_at IS NULL');
    const page = calls.find((c) => /ORDER BY/.test(c.sql));
    expect(page.params.slice(-2)).toEqual([10, 10]);
    expect(page.sql).toContain('ORDER BY s.created_at DESC, s.id DESC');
  });

  it('skips relation queries for an empty page', async () => {
    const { dataSource, calls } = makeDataSource([[/COUNT\(\*\)::int AS total/, [{ total: 0 }]]]);
    const result = await listService(dataSource).list({} as never);
    expect(result).toEqual({ data: [], meta: { total: 0, page: 1, limit: 10 } });
    expect(calls.some((c) => /version_consumers/.test(c.sql))).toBe(false);
  });
});

describe('DataHubDataServiceDetailQueryService', () => {
  const detailRow = {
    id: 1,
    service_code: 'API-FIN-001',
    service_type: 'API',
    status: 'active',
    active_version_id: 11,
    created_by: 1,
    updated_by: null,
    created_at: new Date(),
    updated_at: new Date(),
    version_no: 2,
    state: 'approved',
    name: 'Svc',
    short_description: 'd',
    purpose: null,
    source_table: 't',
    usage_guide_html: '',
    changelog_note: null,
    submitted_by: 2,
    reviewed_by: 2,
    reviewed_at: new Date(),
    version_created_at: new Date(),
    request_unit_id: 3,
    request_unit_code: 'RU',
    request_unit_name: 'Req',
    division_id: 1,
    division_code: 'FIN',
    division_name: 'Finance',
    department_id: 2,
    department_code: 'D1',
    department_name: 'Dept',
  };

  it('maps every user reference to {id, email} using one users query', async () => {
    const { dataSource, calls } = makeDataSource([
      [/FROM data_hub_data_services s\s+JOIN/, [detailRow]],
      [/FROM data_hub_data_service_version_api_specs/, [{ method: 'GET', base_url: 'API_INT' }]],
      [/version_requesters/, [{ user_id: 3 }]],
      [/version_it_supporters/, [{ user_id: 4 }]],
      [/version_service_owners/, [{ user_id: 6 }]],
      [
        /FROM data_hub_data_service_version_consumers/,
        [{ id: 5, code: 'APP1', name: 'A', category: 'INTERNAL_APP', short_description: 'x' }],
      ],
      [
        /FROM data_hub_consumer_so_apps/,
        [
          { consumer_id: 5, user_id: 6 },
          { consumer_id: 5, user_id: 1 },
        ],
      ],
      [/COUNT\(\*\)::int AS term_count/, [{ term_count: 2 }]],
      [/SELECT id, email FROM users/, [1, 2, 3, 4, 6].map((id) => ({ id, email: `u${id}@x.vn` }))],
    ]);
    const userRefs = new DataHubUserRefService(dataSource as never);
    const detail = await new DataHubDataServiceDetailQueryService(dataSource as never, userRefs).detail(1);

    expect(detail.created_by_user).toEqual({ id: 1, email: 'u1@x.vn' });
    expect(detail.updated_by_user).toBeNull();
    // `version` stays free for a future pending/review version
    expect(detail).not.toHaveProperty('version');
    expect(detail.version_active.reviewed_by_user).toEqual({ id: 2, email: 'u2@x.vn' });
    expect(detail.version_active.requesters).toEqual([{ id: 3, email: 'u3@x.vn' }]);
    expect(detail.version_active.it_supporters).toEqual([{ id: 4, email: 'u4@x.vn' }]);
    expect(detail.version_active.service_owners).toEqual([{ id: 6, email: 'u6@x.vn' }]);
    expect(detail.version_active.consumers[0].so_apps).toEqual([
      { id: 6, email: 'u6@x.vn' },
      { id: 1, email: 'u1@x.vn' },
    ]);
    expect(detail.version_active.api_spec).toMatchObject({ method: 'GET', base_url_host: 'api-int.vpbank.com.vn' });
    expect(detail.version_active.sftp_spec).toBeNull();
    expect(detail.version_active.term_count).toBe(2);
    expect(detail.pending_version_id).toBeNull();
    expect(calls.filter((c) => /FROM users/.test(c.sql))).toHaveLength(1);
    expect(calls.find((c) => /FROM data_hub_data_service_version_consumers/.test(c.sql)).sql).toContain(
      ACTIVE_CONSUMER,
    );
    calls.forEach((c) => noStar(c.sql));
  });

  it('404 when the service is not live or has no active version', async () => {
    const { dataSource } = makeDataSource([]);
    const userRefs = new DataHubUserRefService(dataSource as never);
    await expect(new DataHubDataServiceDetailQueryService(dataSource as never, userRefs).detail(1)).rejects.toThrow(
      'DATA_SERVICE_NOT_FOUND',
    );
  });
});

describe('DataHubDataServiceTermsQueryService', () => {
  const group = { id: 5, name: 'dw.customer', description: null, term_count: 2 };
  const term = {
    id: 1,
    code: 'cust_id',
    technical_description: 'd',
    example_value: null,
    logical_id: 9,
    logical_code: 'LT',
    ds_id: 3,
    service_code: 'API-1',
    service_name: 'Svc',
  };

  it('pages the source tables of the active version with their terms nested, searching tables and terms', async () => {
    const { dataSource, calls } = makeDataSource([
      [/SELECT s\.active_version_id/, [{ active_version_id: 11 }]],
      [/COUNT\(\*\)::int AS total/, [{ total: 1 }]],
      [/SELECT st\.id, st\.name, st\.description, tc\.term_count/, [group]],
      [/WHERE p\.source_table_id = ANY\(\$2::int\[\]\)/, [{ ...term, source_table_id: group.id }]],
    ]);
    const res = await new DataHubDataServiceTermsQueryService(dataSource as never).sourceTables(1, {
      keyword: ' a_b ',
      page: 1,
      limit: 10,
    } as never);
    const ownTerm = {
      id: 1,
      code: 'cust_id',
      technical_description: 'd',
      example_value: null,
      logical_term: { id: 9, code: 'LT' },
    };
    expect(res).toEqual({ data: [{ ...group, physical_terms: [ownTerm] }], meta: { total: 1, page: 1, limit: 10 } });
    expect(calls.find((c) => /ANY\(\$2::int\[\]\)/.test(c.sql))?.params).toEqual([11, [group.id]]);
    const count = calls.find((c) => /COUNT/.test(c.sql));
    expect(count?.params).toEqual([11, '%a\\_b%']);
    expect(count?.sql).toContain('vp.data_service_version_id = $1');
    calls.forEach((c) => noStar(c.sql));
  });

  it('lists the terms of one source table without the owning-service field', async () => {
    const { dataSource, calls } = makeDataSource([
      [/SELECT s\.active_version_id/, [{ active_version_id: 11 }]],
      [/WHERE p\.source_table_id = ANY\(\$2::int\[\]\)/, [{ ...term, source_table_id: 5 }]],
    ]);
    const res = await new DataHubDataServiceTermsQueryService(dataSource as never).sourceTableTerms(1, 5);
    expect(res.data).toEqual([
      { id: 1, code: 'cust_id', technical_description: 'd', example_value: null, logical_term: { id: 9, code: 'LT' } },
    ]);
    expect(calls[1].params).toEqual([11, [5]]);
  });

  it('404 for a missing service', async () => {
    const { dataSource } = makeDataSource([]);
    await expect(
      new DataHubDataServiceTermsQueryService(dataSource as never).sourceTables(1, {} as never),
    ).rejects.toThrow('DATA_SERVICE_NOT_FOUND');
  });
});

describe('DataHubDataServiceHistoryService', () => {
  it('lists histories newest first with changed_by_user as {id, email}', async () => {
    const { dataSource, calls } = makeDataSource([
      [/SELECT 1 AS ok/, [{ ok: 1 }]],
      [/COUNT\(\*\)::int AS total/, [{ total: 1 }]],
      [
        /FROM data_hub_data_service_histories h\s+WHERE/,
        [
          {
            id: 8,
            version_no: 2,
            action: 'UPDATE',
            change_note: null,
            changed_by: 3,
            created_at: new Date(),
            change_count: 4,
          },
        ],
      ],
      [/SELECT id, email FROM users/, [{ id: 3, email: 'u3@x.vn' }]],
    ]);
    const service = new DataHubDataServiceHistoryService(
      dataSource as never,
      new DataHubUserRefService(dataSource as never),
    );
    const result = await service.listHistories(1, { page: 1, limit: 5 } as never);
    expect(result.data[0]).toMatchObject({ id: 8, change_count: 4, changed_by_user: { id: 3, email: 'u3@x.vn' } });
    expect(calls.some((c) => /created_at DESC/.test(c.sql))).toBe(true);
    calls.forEach((c) => noStar(c.sql));
  });

  it('history detail returns the stored changes and 404 for another service', async () => {
    const row = {
      id: 8,
      version_no: 2,
      action: 'UPDATE',
      change_note: null,
      changes: [{ field: 'name' }],
      changed_by: 3,
      created_at: new Date(),
    };
    const found = makeDataSource([
      [/FROM data_hub_data_service_histories h\s+JOIN/, [row]],
      [/SELECT id, email FROM users/, [{ id: 3, email: 'u3@x.vn' }]],
    ]);
    const service = new DataHubDataServiceHistoryService(
      found.dataSource as never,
      new DataHubUserRefService(found.dataSource as never),
    );
    await expect(service.historyDetail(1, 8)).resolves.toMatchObject({
      changes: [{ field: 'name' }],
      changed_by_user: { email: 'u3@x.vn' },
    });
    expect(found.calls[0].params).toEqual([8, 1]);

    const empty = makeDataSource([]);
    const missing = new DataHubDataServiceHistoryService(
      empty.dataSource as never,
      new DataHubUserRefService(empty.dataSource as never),
    );
    await expect(missing.historyDetail(1, 8)).rejects.toThrow('DATA_SERVICE_HISTORY_NOT_FOUND');
  });

  it('404 for versions of an unknown service', async () => {
    const { dataSource } = makeDataSource([]);
    const service = new DataHubDataServiceHistoryService(
      dataSource as never,
      new DataHubUserRefService(dataSource as never),
    );
    await expect(service.listVersions(1, {} as never)).rejects.toThrow('DATA_SERVICE_NOT_FOUND');
  });
});

describe('DataHubDataServiceExportService', () => {
  it('builds one row per service with consumer codes and localized labels', async () => {
    const { dataSource } = makeDataSource([
      [
        /SELECT\s+s\.id, s\.service_code/,
        [
          listRow,
          {
            ...listRow,
            id: 2,
            version_id: 12,
            service_type: 'SFTP',
            status: 'inactive',
            method: null,
            base_url: null,
            endpoint_path: null,
            update_frequency: null,
            flow_direction: 'PUSH',
            export_frequency: 'HOURLY',
            file_format: 'CSV',
            sftp_folder_path: '/outbound/',
            name: '=cmd',
          },
        ],
      ],
      [
        /FROM data_hub_data_service_version_consumers/,
        [
          { version_id: 11, id: 1, code: 'A', name: 'a' },
          { version_id: 11, id: 2, code: 'B', name: 'b' },
        ],
      ],
    ]);
    const exporter = new DataHubDataServiceExportService(listService(dataSource));
    const rows = await exporter.buildRows({ status: 'all' } as never);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      stt: 1,
      endpoint_or_folder: 'api-int.vpbank.com.vn/v1/x',
      consumers: 'A, B',
      status: 'Hoạt động',
    });
    expect(rows[1]).toMatchObject({
      stt: 2,
      method_or_direction: 'PUSH',
      endpoint_or_folder: '/outbound/',
      name: "'=cmd",
      status: 'Ngừng hoạt động',
    });
  });

  it('caps the export at 5000 rows', async () => {
    const { dataSource, calls } = makeDataSource([]);
    await new DataHubDataServiceExportService(listService(dataSource)).buildRows({} as never);
    expect(calls[0].params.slice(-2)).toEqual([5000, 0]);
  });

  it('neutralizes spreadsheet formulas', () => {
    expect(safeCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(safeCell('+1')).toBe("'+1");
    expect(safeCell('plain')).toBe('plain');
    expect(safeCell(null)).toBe('');
  });
});

describe('buildListWhere physical term filters', () => {
  it('physical_term_ids and logical_term_ids only match live physical terms', () => {
    const byPhysical = buildListWhere({ physical_term_ids: [5] } as never).where;
    expect(byPhysical).toContain('JOIN data_hub_physical_terms fpt');
    expect(byPhysical).toContain('fpt.deleted_at IS NULL');
    expect(byPhysical).not.toContain('fpt.status');
    const byLogical = buildListWhere({ logical_term_ids: [5] } as never).where;
    expect(byLogical).toContain('flt.deleted_at IS NULL');
  });
});
