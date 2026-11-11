import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataHubServiceType } from '@modules/databases/data-hub-enums';
import { DH_PERMISSIONS as P } from '../../common/data-hub-permission-codes';
import { CreateDataServiceDto } from '../../data-service/dto';
import { DataServiceImportService, SERVICE_CODE_PATTERN } from '../data-service-import.service';
import { SERVICE_IMPORT_LAYOUTS, ServiceImportKind } from '../import-layouts';
import { ExistingService, ImportReferences } from '../import-lookups.service';
import { DataServiceImportTemplateService } from '../import-templates.service';
import { cellText } from '../import-workbook.util';
import { accessWith, CALLER, colOf, editSheet, letterOfKey, loadBook } from './import-test-helpers';

const API = SERVICE_IMPORT_LAYOUTS.API;
const SFTP = SERVICE_IMPORT_LAYOUTS.SFTP;
const ALL = [P.DATA_SERVICE_CREATE, P.DATA_SERVICE_UPDATE];

// Rows of the tables the example sample reads its codes from.
const templateDataSource = {
  query: jest.fn((sql: string) => {
    if (sql.includes('data_hub_request_units')) return [{ code: 'AF' }];
    if (sql.includes('data_hub_divisions')) return [{ code: 'EDA' }];
    if (sql.includes('data_hub_departments')) return [{ code: 'C360' }];
    if (sql.includes('data_hub_consumers')) return [{ code: 'APP_CRM' }, { code: 'APP_LOS' }];
    return [];
  }),
};

// One example file and the service codes in it (each download gets new codes).
async function example(kind: ServiceImportKind = 'API'): Promise<{ file: Buffer; codes: string[] }> {
  const file = await new DataServiceImportTemplateService(templateDataSource as never).build(kind, {
    email: 'so@vpbank.com.vn',
  });
  const wb = await loadBook(file);
  const layout = SERVICE_IMPORT_LAYOUTS[kind];
  const c = colOf(layout, 'service_code');
  const codes: string[] = [];
  for (let r = 2; cellText(wb.worksheets[0].getCell(r, c).value) !== ''; r++) {
    codes.push(cellText(wb.worksheets[0].getCell(r, c).value));
  }
  return { file, codes };
}

// Lookups as the example rows expect them; tests change entries to plant errors.
const references = (services: Record<string, ExistingService> = {}): ImportReferences => ({
  requestUnits: new Map([['af', 3]]),
  divisions: new Map([['eda', 1]]),
  departments: new Map([['c360', 2]]),
  domains: new Map([['https://api-int.vpbank.com.vn', 7]]),
  consumers: new Map([
    ['app_crm', { id: 40, active: true }],
    ['app_los', { id: 41, active: true }],
  ]),
  users: new Map([['so@vpbank.com.vn', 9]]),
  writableDepartmentIds: { create: null, update: null },
  services: new Map(Object.entries(services).map(([code, s]) => [code.toLowerCase(), s])),
});

type WriteResult = { id: number; service_code: string; version_id: number; version_no: number };

function harness(refs = references(), codes: string[] = ALL) {
  let nextId = 100;
  const created: CreateDataServiceDto[] = [];
  const writeService = {
    create: jest.fn<Promise<WriteResult>, [CreateDataServiceDto, unknown, string?]>((dto, _caller, code) => {
      created.push(dto);
      const id = nextId++;
      return Promise.resolve({ id, service_code: code ?? `GEN_${id}`, version_id: id, version_no: 1 });
    }),
    update: jest.fn<Promise<WriteResult>, [number, CreateDataServiceDto, unknown, { keepSourceTables?: boolean }?]>(
      (id) => Promise.resolve({ id, service_code: 'KEPT_CODE', version_id: 900, version_no: 2 }),
    ),
  };
  const lookup = { load: jest.fn(() => Promise.resolve(refs)) };
  const service = new DataServiceImportService(lookup as never, writeService as never, accessWith(...codes) as never);
  return { service, writeService, created };
}

const at =
  (layout = API) =>
  (issues: Array<{ column?: string; row: number; code: string }>, key: string, row: number) =>
    issues.filter((i) => i.column === letterOfKey(layout, key) && i.row === row).map((i) => i.code);
const atApi = at(API);

describe('DataServiceImportService - create and update by service code', () => {
  it('dry run of the API example: every row will be created, nothing is written', async () => {
    const { file } = await example();
    const h = harness();
    const res = await h.service.import('API', file, true, CALLER);
    expect(res.issues).toEqual([]);
    expect(res.summary.services).toEqual({ total: 2, valid: 2, created: 0, updated: 0, unchanged: 0, failed: 0 });
    expect(res.services.map((s) => [s.action, s.status])).toEqual([
      ['create', 'valid'],
      ['create', 'valid'],
    ]);
    expect(h.writeService.create).not.toHaveBeenCalled();
  });

  it('a new code creates the service with exactly that (upper-cased) code and the create payload', async () => {
    const { file: sample, codes } = await example();
    const h = harness();
    const file = await editSheet(
      sample,
      API,
      (s, col) => (s.getCell(2, col('service_code')).value = codes[0].toLowerCase()),
    );
    const res = await h.service.import('API', file, false, CALLER);
    expect(res.issues).toEqual([]);
    expect(h.writeService.create.mock.calls[0][2]).toBe(codes[0]);
    expect(h.created[0]).toMatchObject({
      service_type: DataHubServiceType.API,
      request_unit_id: 3,
      division_id: 1,
      department_id: 2,
      consumer_ids: [40, 41],
      requester_user_ids: [9],
      service_owner_user_ids: [9],
      it_support: { email: 'so@vpbank.com.vn', phone: '0243928888' },
      api_spec: { method: 'GET', domain_id: 7, encryption: 'HYBRID', sync_mode: 'SYNC', timeout: '3000' },
    });
    expect(h.created[0].source_tables).toBeUndefined();
    expect(res.services[0]).toMatchObject({ action: 'create', status: 'created', code: codes[0] });
  });

  it('an SFTP row is created with its spec', async () => {
    const { file, codes } = await example('SFTP');
    const h = harness();
    const res = await h.service.import('SFTP', file, false, CALLER);
    expect(res.issues).toEqual([]);
    expect(h.writeService.create.mock.calls[0][2]).toBe(codes[0]);
    expect(h.created[0]).toMatchObject({
      service_type: DataHubServiceType.SFTP,
      sftp_spec: { folder_path: '/outbound/card/', encryption: 'HYBRID', flow_direction: 'PUSH' },
    });
  });

  it('an existing code updates that service with the row values and keeps its source tables', async () => {
    const { file, codes } = await example();
    const h = harness(references({ [codes[0]]: { id: 55, type: DataHubServiceType.API, departmentId: 2 } }));
    const res = await h.service.import('API', file, false, CALLER);
    expect(res.issues).toEqual([]);
    expect(h.writeService.update).toHaveBeenCalledTimes(1);
    const [id, dto, , opts] = h.writeService.update.mock.calls[0];
    expect(id).toBe(55);
    expect(opts).toEqual({ keepSourceTables: true });
    expect(dto).toMatchObject({ consumer_ids: [40, 41], api_spec: { domain_id: 7 } });
    expect(typeof dto.name).toBe('string');
    expect((dto as { source_tables?: unknown }).source_tables).toBeUndefined();
    expect(res.services.map((s) => [s.action, s.status])).toEqual([
      ['update', 'updated'],
      ['create', 'created'],
    ]);
    expect(res.summary.services).toMatchObject({ created: 1, updated: 1 });
  });

  it('an update that changes nothing is unchanged', async () => {
    const { file, codes } = await example();
    const h = harness(references({ [codes[0]]: { id: 55, type: DataHubServiceType.API, departmentId: 2 } }));
    h.writeService.update.mockRejectedValueOnce(new BadRequestException('NO_CHANGES: nothing to update'));
    const res = await h.service.import('API', file, false, CALLER);
    expect(res.issues).toEqual([]);
    expect(res.services[0].status).toBe('unchanged');
  });

  it('the code must be given, valid, once per file and of a service of this type', async () => {
    expect(SERVICE_CODE_PATTERN.test('API_EDA_DPD_12')).toBe(true);
    const { file: sample, codes } = await example();
    const h = harness(references({ SFTP_TAKEN: { id: 60, type: DataHubServiceType.SFTP, departmentId: 2 } }));
    const file = await editSheet(sample, API, (s, col) => {
      s.getCell(2, col('service_code')).value = 'MÃ CÓ DẤU';
      s.getCell(3, col('service_code')).value = null;
      s.getRow(4).values = s.getRow(3).values as never;
      s.getCell(4, col('service_code')).value = 'sftp_taken';
      s.getRow(5).values = s.getRow(4).values as never;
      s.getCell(5, col('service_code')).value = codes[0];
      s.getRow(6).values = s.getRow(4).values as never;
      s.getCell(6, col('service_code')).value = codes[0].toLowerCase();
    });
    const res = await h.service.import('API', file, false, CALLER);
    expect(atApi(res.issues, 'service_code', 2)).toEqual(['INVALID_VALUE']);
    expect(atApi(res.issues, 'service_code', 3)).toEqual(['REQUIRED']);
    expect(atApi(res.issues, 'service_code', 4)).toEqual(['SERVICE_TYPE_MISMATCH']);
    expect(atApi(res.issues, 'service_code', 5)).toEqual(['DUPLICATE_IN_FILE']);
    expect(atApi(res.issues, 'service_code', 6)).toEqual(['DUPLICATE_IN_FILE']);
    expect(h.writeService.create).not.toHaveBeenCalled();
    expect(h.writeService.update).not.toHaveBeenCalled();
  });

  it('each row needs the right of what it does', async () => {
    const { file, codes } = await example();
    const refs = references({ [codes[0]]: { id: 55, type: DataHubServiceType.API, departmentId: 2 } });
    const onlyCreate = harness(refs, [P.DATA_SERVICE_CREATE]);
    const res = await onlyCreate.service.import('API', file, false, CALLER);
    expect(atApi(res.issues, 'service_code', 2)).toEqual(['PERMISSION_DENIED']);
    expect(onlyCreate.writeService.update).not.toHaveBeenCalled();
    expect(onlyCreate.writeService.create).toHaveBeenCalledTimes(1);
  });

  it('writes only in departments the caller belongs to: the row department and, on update, the current one', async () => {
    const { file, codes } = await example();
    const refs = references({ [codes[0]]: { id: 55, type: DataHubServiceType.API, departmentId: 8 } });
    refs.writableDepartmentIds = { create: new Set([5]), update: new Set([2]) };
    const h = harness(refs);
    const res = await h.service.import('API', file, false, CALLER);
    // Row 2 updates a service of department 8 (not writable); row 3 creates in department 2 (not writable for create).
    expect(atApi(res.issues, 'service_code', 2)).toEqual(['DEPARTMENT_FORBIDDEN']);
    expect(atApi(res.issues, 'department', 3)).toEqual(['DEPARTMENT_FORBIDDEN']);
    expect(h.writeService.create).not.toHaveBeenCalled();
    expect(h.writeService.update).not.toHaveBeenCalled();
  });
});

describe('DataServiceImportService - row checks', () => {
  it('required columns follow the create API (App thụ hưởng included)', () => {
    const required = (layout = API) => layout.sheets[0].columns.filter((c) => c.level === 'r').map((c) => c.key);
    expect(required(API)).toEqual([
      'service_code',
      'name',
      'short_description',
      'request_unit',
      'consumers',
      'requesters',
      'method',
      'domain',
      'endpoint_path',
      'auth_type',
      'encryption',
      'update_frequency',
      'sync_mode',
      'usage_guide_html',
      'division',
      'department',
      'service_owners',
    ]);
    expect(required(SFTP)).toEqual([
      'service_code',
      'name',
      'short_description',
      'request_unit',
      'consumers',
      'requesters',
      'encryption',
      'file_format',
      'export_frequency',
      'usage_guide_html',
      'division',
      'department',
      'service_owners',
    ]);
  });

  it('an empty required cell, an unknown or inactive app, and a SYNC call without timeout fail the row', async () => {
    const { file: sample } = await example();
    const refs = references();
    refs.consumers.set('app_los', { id: 41, active: false });
    const h = harness(refs);
    const file = await editSheet(sample, API, (s, col) => {
      s.getCell(2, col('consumers')).value = null;
      s.getCell(2, col('usage_guide_html')).value = null;
      s.getCell(3, col('consumers')).value = 'APP_LOS; NO_SUCH_APP';
      s.getCell(3, col('sync_mode')).value = 'sync';
    });
    const res = await h.service.import('API', file, false, CALLER);
    expect(atApi(res.issues, 'consumers', 2)).toContain('REQUIRED');
    expect(atApi(res.issues, 'usage_guide_html', 2)).toContain('REQUIRED');
    // Several problems of one cell are joined into that cell's entry.
    expect(atApi(res.issues, 'consumers', 3)).toEqual(['CONSUMER_INACTIVE, CODE_NOT_FOUND']);
    expect(atApi(res.issues, 'timeout', 3).length).toBeGreaterThan(0);
    expect(h.writeService.create).not.toHaveBeenCalled();
  });

  it('IT hỗ trợ: one of the three columns is enough; none, or a link of another site, fails on its column', async () => {
    const { file: sample } = await example();
    const h = harness();
    const file = await editSheet(sample, API, (s, col) => {
      s.getCell(2, col('it_support_email')).value = null;
      s.getCell(2, col('it_support_phone')).value = null;
      s.getCell(3, col('it_support_email')).value = null;
      s.getCell(3, col('it_support_phone')).value = null;
      s.getCell(3, col('it_support_link')).value = 'https://example.com/group';
    });
    const res = await h.service.import('API', file, false, CALLER);
    expect(atApi(res.issues, 'it_support_email', 2).length).toBe(1);
    expect(atApi(res.issues, 'it_support_link', 3).length).toBe(1);

    const onlyLink = await editSheet(sample, API, (s, col) => {
      s.getCell(2, col('it_support_email')).value = null;
      s.getCell(2, col('it_support_phone')).value = null;
      s.getCell(2, col('it_support_link')).value = 'https://zalo.me/g/abc';
    });
    const h2 = harness();
    const ok = await h2.service.import('API', onlyLink, false, CALLER);
    expect(ok.issues).toEqual([]);
    expect(h2.created[0].it_support).toMatchObject({ link: 'https://zalo.me/g/abc' });
  });

  it('resolves Base-URL by url (spelling folded) and rejects an unknown one by cell', async () => {
    const { file: sample } = await example();
    const file = await editSheet(sample, API, (s, col) => {
      s.getCell(2, col('domain')).value = ' API-INT.vpbank.com.vn/ ';
      s.getCell(3, col('domain')).value = 'https://api-xyz.vpbank.com.vn';
    });
    const h = harness();
    const res = await h.service.import('API', file, false, CALLER);
    expect(res.issues.map((i) => [i.row, i.code])).toEqual([[3, 'DOMAIN_NOT_FOUND']]);
    expect(h.created[0]).toMatchObject({ api_spec: { domain_id: 7 } });
  });

  it('annotates the result file and keeps going past a failed write', async () => {
    const { file } = await example();
    const h = harness();
    h.writeService.create.mockImplementationOnce(() => Promise.reject(new ConflictException('SERVICE_CODE_EXISTS')));
    const res = await h.service.import('API', file, false, CALLER);
    expect(res.services.map((s) => s.status)).toEqual(['failed', 'created']);
    expect(res.issues).toEqual([expect.objectContaining({ row: 2, code: 'CREATE_FAILED' })]);
    const out = await loadBook(Buffer.from(res.result_file.content_base64, 'base64'));
    const status = API.sheets[0].columns.length + 1;
    expect(cellText(out.worksheets[0].getCell(1, status).value)).toBe('Kết quả');
    expect(cellText(out.worksheets[0].getCell(2, status).value)).toBe('Lỗi');
    expect(cellText(out.worksheets[0].getCell(3, status).value)).toBe('Thành công');
  });

  it('rejects a file whose headers do not match, or the other kind of template', async () => {
    const { file: sample } = await example();
    const file = await editSheet(sample, API, (s) => (s.getCell(1, 3).value = 'Tên dịch vụ'));
    await expect(harness().service.import('API', file, true, CALLER)).rejects.toThrow(/INVALID_TEMPLATE/);
    await expect(harness().service.import('SFTP', sample, true, CALLER)).rejects.toThrow(/INVALID_TEMPLATE/);
  });

  it('refuses a second real import from the same user while one runs; a dry run is never blocked', async () => {
    const { file } = await example();
    const h = harness();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    h.writeService.create.mockImplementationOnce(async () => {
      await gate;
      return { id: 100, service_code: 'X', version_id: 100, version_no: 1 };
    });
    const first = h.service.import('API', file, false, CALLER);
    await new Promise((r) => setTimeout(r, 50));
    await expect(h.service.import('API', file, false, CALLER)).rejects.toThrow(/IMPORT_IN_PROGRESS/);
    await expect(h.service.import('API', file, true, CALLER)).resolves.toBeDefined();
    release();
    await first;
  });
});
