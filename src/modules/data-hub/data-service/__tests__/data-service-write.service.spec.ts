import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataHubServiceType, DataHubStatus } from '@modules/databases/data-hub-enums';
import { DataHubAccessService } from '../../common/data-hub-access.service';
import { DataHubUserRefService } from '../../common/data-hub-user-ref.service';
import { DataHubDataServiceWriteService } from '../data-hub-data-service-write.service';
import { DataServiceSnapshotService } from '../data-service-snapshot.service';
import { CreateDataServiceDto, UpdateDataServiceDto } from '../dto';

type Handler = [RegExp, unknown];

// The service's only term (id 7) in source table 5; the version links point at it.
const ownTerm = {
  id: 7,
  code: 'cust_id',
  technical_description: 'd',
  data_type: 'VARCHAR',
  is_required: false,
  example_value: null,
  source_table_id: 5,
  logical_term_id: null,
};
const termLabelRow = {
  id: 7,
  code: 'cust_id',
  technical_description: 'd',
  data_type: 'VARCHAR',
  is_required: false,
  example_value: null,
  source_table: 'dw.t',
};

// A normal (non super_admin) user-client caller; the department rule is exercised on every test.
const as = (id: number) => ({ id, type: 'user', client: 'user' });
const SUPER = { id: 1, type: 'super_admin' };

// Manager that answers by SQL fragment and records every statement, so flows can be asserted without a database.
function makeHarness(overrides: Handler[] = []) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const defaults: Handler[] = [
    // tables the service already uses, source tables / own terms (lock FOR UPDATE, so before the package lock)
    [/SELECT DISTINCT p.source_table_id AS id/, [{ id: 5 }]],
    [/FROM data_hub_source_tables st WHERE st.id = ANY/, [{ id: 5, name: 'dw.t', description: null, usable: true }]],
    [/WHERE p.data_service_id = \$1 AND/, [ownTerm]],
    [/JOIN UNNEST\(\$1::int\[\], \$2::text\[\]\)/, []],
    [/FROM data_hub_physical_terms t JOIN data_hub_source_tables st/, [termLabelRow]],
    [
      /FOR UPDATE/,
      [
        {
          id: 10,
          service_code: 'API-FIN-001',
          service_type: 'API',
          status: 'active',
          active_version_id: 100,
          department_id: 1,
        },
      ],
    ],
    [/nextval\(pg_get_serial_sequence\('data_hub_data_services'/, [{ id: 10 }]],
    // the caller is a member of department 1 unless a test overrides it
    [/FROM data_hub_department_members m/, [{ department_id: 1 }]],
    [/MAX\(version_no\)/, [{ max_no: 1 }]],
    [/INSERT INTO data_hub_data_services/, []],
    [/INSERT INTO data_hub_data_service_versions/, [{ id: 101 }]],
    [/FROM data_hub_data_service_versions v WHERE v\.id/, [storedVersion]],
    [/SELECT version_no FROM data_hub_data_service_versions/, [{ version_no: 1 }]],
    [/FROM data_hub_request_units/, [{ id: 1, code: 'RU1' }]],
    [/FROM data_hub_divisions/, [{ id: 1, code: 'FIN' }]],
    [/FROM data_hub_departments/, [{ id: 1, code: 'D1' }]],
    [/FROM data_hub_consumers c/, [{ id: 5, code: 'APP1' }]],
    [/SELECT id FROM users/, [{ id: 1 }, { id: 2 }]],
    [
      /SELECT id, email FROM users/,
      [
        { id: 1, email: 'a@x.vn' },
        { id: 2, email: 'b@x.vn' },
      ],
    ],
    [/FROM data_hub_data_service_version_api_specs s/, [storedApiSpec]],
    [/FROM data_hub_data_service_version_sftp_specs s/, []],
    [/FROM data_hub_data_service_version_requesters l/, [{ id: 1 }]],
    [/FROM data_hub_data_service_version_it_supporters l/, [{ id: 2 }]],
    [/FROM data_hub_data_service_version_service_owners l/, [{ id: 1 }]],
    [/FROM data_hub_data_service_version_consumers l/, [{ id: 5 }]],
    [/FROM data_hub_data_service_version_physical_terms l/, [{ id: 7 }]],
  ];
  const handlers = [...overrides, ...defaults];
  const manager = {
    query: jest.fn((sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const hit = handlers.find(([re]) => re.test(sql));
      const result = hit ? hit[1] : [];
      return Promise.resolve(result);
    }),
  };
  const dataSource = {
    transaction: jest.fn((fn: (m: unknown) => Promise<unknown>) => fn(manager)),
    manager,
  };
  const userRefs = new DataHubUserRefService(dataSource as never);
  const access = new DataHubAccessService(dataSource as never, { getPermissions: jest.fn() } as never);
  const snapshots = new DataServiceSnapshotService(userRefs);
  const logicalHistory = { recordVersions: jest.fn().mockResolvedValue(undefined) };
  const service = new DataHubDataServiceWriteService(dataSource as never, snapshots, access, logicalHistory as never);
  const find = (re: RegExp) => calls.filter((c) => re.test(c.sql));
  return { service, dataSource, calls, find };
}

const storedApiSpec = {
  method: 'GET',
  base_url: 'API_INT',
  endpoint_path: '/v1/x',
  auth_type: 'BEARER_TOKEN',
  peak_tps: null,
  update_frequency: 'REALTIME',
  sync_mode: 'SYNC',
  timeout: null,
  sample_request: null,
  sample_response: null,
};

const storedVersion = {
  version_no: 1,
  name: 'Svc',
  short_description: 'desc',
  purpose: null,
  usage_guide_html: '<p>x</p>',
  request_unit_id: 1,
  division_id: 1,
  department_id: 1,
};

const baseDto = (): CreateDataServiceDto =>
  ({
    service_type: DataHubServiceType.API,
    name: 'Svc',
    short_description: 'desc',
    request_unit_id: 1,
    division_id: 1,
    department_id: 1,
    usage_guide_html: '<p>x</p>',
    consumer_ids: [5],
    requester_user_ids: [1],
    it_supporter_user_ids: [2],
    service_owner_user_ids: [1],
    source_tables: [
      { id: 5, name: 'dw.t', terms: [{ id: 7, code: 'cust_id', technical_description: 'd', data_type: 'VARCHAR' }] },
    ],
    api_spec: { ...storedApiSpec },
  }) as unknown as CreateDataServiceDto;

const toUpdate = (dto: CreateDataServiceDto): UpdateDataServiceDto => {
  const rest: Record<string, unknown> = { ...dto };
  delete rest.service_type;
  return rest as unknown as UpdateDataServiceDto;
};

describe('DataHubDataServiceWriteService.create', () => {
  it('rejects a spec that does not match the type before writing anything', async () => {
    const { service, find } = makeHarness();
    const dto = { ...baseDto(), sftp_spec: {} } as unknown as CreateDataServiceDto;
    await expect(service.create(dto, as(1))).rejects.toThrow('SPEC_MISMATCH');
    const sftpWithoutSpec = { ...baseDto(), service_type: DataHubServiceType.SFTP, api_spec: undefined };
    await expect(service.create(sftpWithoutSpec as never, as(1))).rejects.toThrow('SPEC_MISMATCH');
    expect(find(/INSERT INTO/)).toHaveLength(0);
  });

  it('a caller outside the department gets 403 even with a malformed spec', async () => {
    const { service } = makeHarness([[/FROM data_hub_department_members m/, [{ department_id: 2 }]]]);
    const dto = { ...baseDto(), sftp_spec: {} } as unknown as CreateDataServiceDto;
    await expect(service.create(dto, as(3))).rejects.toThrow('DEPARTMENT_FORBIDDEN');
  });

  it('writes package, approved version 1, spec, links, active pointer and CREATE history in order', async () => {
    const { service, calls, find } = makeHarness();
    const result = await service.create(baseDto(), as(9));

    // [SERVICE]_<division>_<department>_<id>, id reserved from the sequence before the insert
    expect(result).toEqual({ id: 10, service_code: 'API_FIN_D1_10', version_id: 101, version_no: 1 });
    expect(find(/INSERT INTO data_hub_data_services/)[0].params).toEqual([10, 'API_FIN_D1_10', 'API', 9]);

    const versionInsert = find(/INSERT INTO data_hub_data_service_versions/)[0];
    expect(versionInsert.sql).toContain("'approved'");
    expect(versionInsert.params[1]).toBe(1);
    expect(versionInsert.params[2]).toBeNull();
    expect(versionInsert.params[11]).toBe(9);
    expect(versionInsert.params).toHaveLength(12);
    expect(versionInsert.sql).not.toContain('source_table');
    expect(versionInsert.sql).not.toContain('usage_guide_markdown');

    expect(find(/INSERT INTO data_hub_data_service_version_api_specs/)).toHaveLength(1);
    expect(
      find(/INSERT INTO data_hub_data_service_version_(requesters|it_supporters|consumers|physical_terms)/),
    ).toHaveLength(4);
    expect(find(/UPDATE data_hub_data_services SET active_version_id/)[0].params).toEqual([101, 10]);

    const history = find(/INSERT INTO data_hub_data_service_histories/)[0];
    expect(history.params[3]).toBe('CREATE');
    const changes = JSON.parse(history.params[5] as string) as Array<{ old: unknown }>;
    expect(changes.length).toBeGreaterThan(10);
    expect(changes.every((c) => c.old === null || (Array.isArray(c.old) && c.old.length === 0))).toBe(true);
    // history is the last write so a failure earlier leaves nothing behind
    expect(calls[calls.length - 1].sql).toContain('data_hub_data_service_histories');
  });

  it.each([
    ['INVALID_CONSUMERS', /FROM data_hub_consumers c/, [], { consumer_ids: [5, 6] }],
    ['INVALID_REQUEST_UNIT', /FROM data_hub_request_units/, [], {}],
    ['INVALID_DIVISION', /FROM data_hub_divisions/, [], {}],
    ['INVALID_DEPARTMENT', /FROM data_hub_departments/, [], {}],
    ['INVALID_USERS', /SELECT id FROM users/, [{ id: 1 }], {}],
  ])('%s when a referenced id is missing or not live', async (code, re, rows, patch) => {
    const { service, find } = makeHarness([[re, rows]]);
    const dto = { ...baseDto(), ...patch } as CreateDataServiceDto;
    await expect(service.create(dto, as(1))).rejects.toThrow(BadRequestException);
    await expect(service.create(dto, as(1))).rejects.toThrow(code);
    expect(find(/INSERT INTO data_hub_data_services/)).toHaveLength(0);
  });

  it('INVALID_PHYSICAL_TERMS when the body names a term the service does not own (no version written)', async () => {
    const { service, find } = makeHarness([[/WHERE p.data_service_id = \$1 AND/, []]]);
    await expect(service.update(10, toUpdate(baseDto()), as(1))).rejects.toThrow('INVALID_PHYSICAL_TERMS: 7');
    expect(find(/INSERT INTO data_hub_data_service_versions/)).toHaveLength(0);
  });

  it('labels the version terms with their source table from live rows (no status any more)', async () => {
    const { service, find } = makeHarness();
    await service.create(baseDto(), as(1));
    const sql = find(/FROM data_hub_physical_terms t JOIN data_hub_source_tables st/)[0].sql;
    expect(sql).toContain('t.deleted_at IS NULL');
    expect(sql).not.toContain('status');
    const links = find(/INSERT INTO data_hub_data_service_version_physical_terms/)[0];
    expect(links.params[1]).toEqual([7]);
  });

  it('validates consumers as live AND active', async () => {
    const { service, find } = makeHarness();
    await service.create(baseDto(), as(1));
    const sql = find(/FROM data_hub_consumers c/)[0].sql;
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).toContain("c.status = 'active'");
  });
});

describe('DataHubDataServiceWriteService.update', () => {
  it('throws NO_CHANGES and writes nothing when the body equals the active version', async () => {
    const { service, find } = makeHarness();
    await expect(service.update(10, toUpdate(baseDto()), as(3))).rejects.toThrow('NO_CHANGES');
    expect(find(/^\s*(INSERT|UPDATE)/)).toHaveLength(0);
  });

  it('creates version max+1 pointing at the previous one and records the diff', async () => {
    const { service, find } = makeHarness([[/MAX\(version_no\)/, [{ max_no: 4 }]]]);
    const dto = toUpdate({ ...baseDto(), name: 'Renamed', changelog_note: 'why' } as CreateDataServiceDto);
    const result = await service.update(10, dto, as(3));

    // the code is rebuilt from the new version's division/department (an old-format code is replaced)
    expect(result).toEqual({ id: 10, service_code: 'API_FIN_D1_10', version_id: 101, version_no: 5 });
    const versionInsert = find(/INSERT INTO data_hub_data_service_versions/)[0];
    expect(versionInsert.params.slice(0, 3)).toEqual([10, 5, 1]);
    expect(versionInsert.params[10]).toBe('why');
    expect(versionInsert.params[11]).toBe(3);
    expect(find(/UPDATE data_hub_data_services SET active_version_id/)[0].params).toEqual([
      101,
      'API_FIN_D1_10',
      3,
      10,
    ]);

    const history = find(/INSERT INTO data_hub_data_service_histories/)[0];
    expect(history.params[3]).toBe('UPDATE');
    expect(history.params[4]).toBe('why');
    expect(JSON.parse(history.params[5] as string)).toEqual([
      expect.objectContaining({ section: 'general', field: 'name', old: 'Svc', new: 'Renamed' }),
    ]);
  });

  it('locks the package row first', async () => {
    const { service, calls } = makeHarness();
    await service.update(10, toUpdate({ ...baseDto(), name: 'Other' } as CreateDataServiceDto), as(3));
    expect(calls[0].sql).toContain('FOR UPDATE');
  });

  it('404 when the package is missing or has no active version', async () => {
    const { service } = makeHarness([[/FOR UPDATE/, []]]);
    await expect(service.update(10, toUpdate(baseDto()), as(3))).rejects.toThrow(NotFoundException);
  });

  it('rejects a spec of the wrong kind for the stored service type', async () => {
    const { service } = makeHarness();
    const dto = { ...toUpdate(baseDto()), sftp_spec: {} } as unknown as UpdateDataServiceDto;
    await expect(service.update(10, dto, as(3))).rejects.toThrow('SPEC_MISMATCH');
  });
});

describe('DataHubDataServiceWriteService.setStatus', () => {
  it('NO_CHANGES when the status is already set', async () => {
    const { service, find } = makeHarness();
    await expect(service.setStatus(10, DataHubStatus.ACTIVE, as(3))).rejects.toThrow('NO_CHANGES');
    expect(find(/^\s*(INSERT|UPDATE)/)).toHaveLength(0);
  });

  it('updates the status and writes a STATUS history on the active version', async () => {
    const { service, find } = makeHarness();
    await expect(service.setStatus(10, DataHubStatus.INACTIVE, as(3))).resolves.toEqual({ id: 10, status: 'inactive' });
    expect(find(/UPDATE data_hub_data_services SET status/)[0].params).toEqual(['inactive', 3, 10]);
    const history = find(/INSERT INTO data_hub_data_service_histories/)[0];
    expect(history.params.slice(0, 4)).toEqual([10, 100, 1, 'STATUS']);
    expect(JSON.parse(history.params[5] as string)).toEqual([
      expect.objectContaining({ section: 'general', field: 'status', old: 'active', new: 'inactive' }),
    ]);
  });
});

describe('DataHubDataServiceWriteService department rule', () => {
  const notMember: Handler = [/FROM data_hub_department_members m/, [{ department_id: 2 }]];

  it('create in a department the caller is not a member of → 403 before any write', async () => {
    const { service, find } = makeHarness([notMember]);
    await expect(service.create(baseDto(), as(3))).rejects.toThrow('DEPARTMENT_FORBIDDEN');
    expect(find(/INSERT INTO/)).toHaveLength(0);
    // the department row is share-locked so a concurrent delete waits
    expect(find(/FROM data_hub_departments d WHERE d.id = ANY\(\$1\).*FOR SHARE/s)).toHaveLength(1);
  });

  it('update of another department service → 403 even for an identical payload (checked before NO_CHANGES)', async () => {
    const { service, find } = makeHarness([notMember]);
    await expect(service.update(10, toUpdate(baseDto()), as(3))).rejects.toThrow('DEPARTMENT_FORBIDDEN');
    expect(find(/INSERT INTO/)).toHaveLength(0);
  });

  it('moving a service to a department the caller is not in → 403', async () => {
    const { service } = makeHarness();
    const dto = toUpdate({ ...baseDto(), department_id: 2 } as CreateDataServiceDto);
    await expect(service.update(10, dto, as(3))).rejects.toThrow('DEPARTMENT_FORBIDDEN');
  });

  it('status change needs the current department too', async () => {
    const { service } = makeHarness([notMember]);
    await expect(service.setStatus(10, DataHubStatus.INACTIVE, as(3))).rejects.toThrow('DEPARTMENT_FORBIDDEN');
  });

  it('super_admin bypasses membership', async () => {
    const { service, find } = makeHarness([[/FROM data_hub_department_members m/, []]]);
    await expect(service.create(baseDto(), SUPER)).resolves.toMatchObject({ id: 10 });
    expect(find(/FROM data_hub_department_members m/)).toHaveLength(0);
  });
});
