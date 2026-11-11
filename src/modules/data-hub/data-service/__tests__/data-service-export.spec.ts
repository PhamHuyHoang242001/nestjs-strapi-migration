import { PassThrough } from 'stream';
import * as ExcelJS from 'exceljs';
import { DataHubUserRefService } from '../../common/data-hub-user-ref.service';
import { DataHubDataServiceExportService, safeCell } from '../data-hub-data-service-export.service';
import { DataHubDataServiceListQueryService } from '../data-hub-data-service-list-query.service';
import { SERVICE_IMPORT_LAYOUTS } from '../../import/import-layouts';
import { cellText, loadImportWorkbook } from '../../import/import-workbook.util';

type Handler = [RegExp, unknown];

function makeDataSource(handlers: Handler[]) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = jest.fn((sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const hit = handlers.find(([re]) => re.test(sql));
    return Promise.resolve(hit ? hit[1] : []);
  });
  return { dataSource: { query, manager: { query } }, calls };
}

// What the list query returns (only the fields the export reads), in list order: an SFTP service then an API one.
const LIST = [
  { id: 2, version_id: 12, service_code: 'SFTP_EDA_C360_2', service_type: 'SFTP' },
  { id: 1, version_id: 11, service_code: 'API_EDA_C360_1', service_type: 'API' },
];
const DETAILS = [
  {
    version_id: 11,
    name: 'Tra cứu khách hàng',
    short_description: '=cmd',
    purpose: null,
    service_ops: 'Ops',
    it_support: { email: 'it@vpbank.com.vn', phone: null, link: 'https://zalo.me/g/x' },
    usage_guide_html: '<p>HD</p>',
    request_unit: 'AF',
    division: 'EDA',
    department: 'C360',
    consumers: ['APP_CRM', 'APP_LOS'],
    requesters: ['a@vpbank.com.vn'],
    owners: ['so@vpbank.com.vn', 'so2@vpbank.com.vn'],
    method: 'GET',
    domain: 'https://api-int.vpbank.com.vn',
    endpoint_path: '/v1/x',
    auth_type: 'BEARER_TOKEN',
    api_encryption: 'HYBRID',
    peak_tps: null,
    update_frequency: 'REALTIME',
    sync_mode: 'SYNC',
    timeout: '30s',
    sample_request: { cif: '1' },
    sample_response: null,
  },
  {
    version_id: 12,
    name: 'Xuất thẻ',
    short_description: 'd',
    purpose: 'p',
    service_ops: null,
    it_support: { email: null, phone: '0901', link: null },
    usage_guide_html: 'HD',
    request_unit: 'AF',
    division: 'EDA',
    department: 'C360',
    consumers: ['APP_CRM'],
    requesters: ['a@vpbank.com.vn'],
    owners: ['so@vpbank.com.vn'],
    folder_path: '/out/',
    file_name_pattern: 'X_{yyyyMMdd}.csv',
    flow_direction: 'PUSH',
    sftp_encryption: 'NONE',
    file_format: 'CSV',
    export_frequency: 'HOURLY',
    max_file_size: '2GB',
  },
];
function exporter() {
  const { dataSource, calls } = makeDataSource([
    [/SELECT\s+s\.id, s\.service_code/, LIST],
    [/FROM data_hub_data_service_versions v\s+LEFT JOIN data_hub_request_units/, DETAILS],
  ]);
  const list = new DataHubDataServiceListQueryService(
    dataSource as never,
    new DataHubUserRefService(dataSource as never),
  );
  return { service: new DataHubDataServiceExportService(list, dataSource as never), calls };
}

async function written(run: (res: never) => Promise<void>): Promise<{ book: ExcelJS.Workbook; file: Buffer }> {
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on('data', (c: Buffer) => chunks.push(c));
  await run(Object.assign(out, { setHeader: jest.fn(), headersSent: false, status: jest.fn() }) as never);
  const file = Buffer.concat(chunks);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(file as unknown as ArrayBuffer);
  return { book, file };
}

const headersOf = (sheet: ExcelJS.Worksheet) =>
  (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((v) => cellText(v));

describe('DataHubDataServiceExportService', () => {
  it('maps every service to the template columns of its type, in list order, as the import reads them', async () => {
    const rows = await exporter().service.buildRows({} as never, null);
    expect(rows.API).toEqual([
      {
        service_code: 'API_EDA_C360_1',
        name: 'Tra cứu khách hàng',
        short_description: '=cmd',
        request_unit: 'AF',
        consumers: 'APP_CRM; APP_LOS',
        purpose: '',
        requesters: 'a@vpbank.com.vn',
        it_support_email: 'it@vpbank.com.vn',
        it_support_phone: '',
        it_support_link: 'https://zalo.me/g/x',
        service_ops: 'Ops',
        method: 'GET',
        domain: 'https://api-int.vpbank.com.vn',
        endpoint_path: '/v1/x',
        auth_type: 'BEARER_TOKEN',
        encryption: 'HYBRID',
        peak_tps: '',
        update_frequency: 'REALTIME',
        sync_mode: 'SYNC',
        timeout: '30s',
        sample_request: '{"cif":"1"}',
        sample_response: '',
        folder_path: '',
        file_name_pattern: '',
        flow_direction: '',
        file_format: '',
        export_frequency: '',
        max_file_size: '',
        usage_guide_html: '<p>HD</p>',
        division: 'EDA',
        department: 'C360',
        service_owners: 'so@vpbank.com.vn; so2@vpbank.com.vn',
      },
    ]);
    expect(rows.SFTP[0]).toMatchObject({
      service_code: 'SFTP_EDA_C360_2',
      it_support_phone: '0901',
      folder_path: '/out/',
      flow_direction: 'PUSH',
      encryption: 'NONE',
      file_format: 'CSV',
      export_frequency: 'HOURLY',
      max_file_size: '2GB',
    });
    // Every template column of each type has a value key.
    for (const kind of ['API', 'SFTP'] as const) {
      const keys = SERVICE_IMPORT_LAYOUTS[kind].sheets[0].columns.map((c) => c.key).filter((k) => k !== 'stt');
      expect(keys.filter((k) => !(k in rows[kind][0]))).toEqual([]);
    }
  });

  it('no service_type: one file with the API and SFTP sheets, exact template headers, importable as is', async () => {
    const { service } = exporter();
    const { book, file } = await written((res) => service.export({} as never, null, res));
    expect(book.worksheets.map((w) => w.name)).toEqual(['DICH_VU_API', 'DICH_VU_SFTP']);
    for (const [i, kind] of (['API', 'SFTP'] as const).entries()) {
      expect(headersOf(book.worksheets[i])).toEqual(
        SERVICE_IMPORT_LAYOUTS[kind].sheets[0].columns.map((c) => c.header),
      );
    }
    const api = book.worksheets[0];
    expect(cellText(api.getCell(2, 1).value)).toBe('1');
    // Formula-like text is written as text; reading it back gives the original value.
    expect(api.getCell(2, 4).value).toBe("'=cmd");
    const { sheets } = await loadImportWorkbook(file, SERVICE_IMPORT_LAYOUTS.API);
    expect(sheets.SERVICES[0].values).toMatchObject({ service_code: 'API_EDA_C360_1', short_description: '=cmd' });
  });

  it('service_type picks a single sheet', async () => {
    const { service } = exporter();
    const { book } = await written((res) => service.export({ service_type: 'SFTP' } as never, null, res));
    expect(book.worksheets.map((w) => w.name)).toEqual(['DICH_VU_SFTP']);
    expect(cellText(book.worksheets[0].getCell(2, 2).value)).toBe('SFTP_EDA_C360_2');
  });

  it('reads only live specs, and caps the export at 5000 services', async () => {
    const { service, calls } = exporter();
    await service.buildRows({} as never, null);
    expect(calls[0].params.slice(-2)).toEqual([5000, 0]);
    const detail = calls.find((c) => /LEFT JOIN data_hub_request_units/.test(c.sql))?.sql ?? '';
    expect(detail).toContain('a.deleted_at IS NULL AND a.is_deleted IS NOT TRUE');
    expect(detail).toContain('f.deleted_at IS NULL AND f.is_deleted IS NOT TRUE');
  });

  it('safeCell neutralizes spreadsheet formulas', () => {
    expect(safeCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(safeCell('+1')).toBe("'+1");
    expect(safeCell('plain')).toBe('plain');
    expect(safeCell(null)).toBe('');
  });
});
