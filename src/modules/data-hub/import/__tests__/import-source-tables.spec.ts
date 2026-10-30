import { ConflictException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { SourceTableService } from '../import-lookups.service';
import { SourceTableImportService } from '../import-source-tables.service';
import { SourceTableImportTemplateService } from '../import-templates.service';
import { cellText } from '../import-workbook.util';

const CALLER = { id: 1, type: 'super_admin' };
const SHEET = 'BANG_NGUON_THUAT_NGU';

const templateDataSource = {
  query: jest.fn((sql: string) =>
    sql.includes('data_hub_data_services')
      ? [{ code: 'API_EDA_C360_7' }]
      : [{ code: 'DATE_OF_BIRTH' }, { code: 'CUSTOMER_CIF' }],
  ),
};
const exampleFile = () => new SourceTableImportTemplateService(templateDataSource as never).build(true);

// The service the example points at: one table of its own with one term.
const existingService = (): SourceTableService => ({
  id: 7,
  code: 'API_EDA_C360_7',
  activeVersionId: 70,
  departmentId: 2,
  tables: [
    {
      id: 500,
      name: 'OWN_TABLE',
      description: 'own',
      terms: [
        {
          id: 900,
          code: 'OLD_COL',
          technical_description: 'old',
          data_type: 'INT',
          is_required: false,
          example_value: null,
          logical_term: null,
        },
      ],
    },
  ],
});

function harness(opts: { canUpdate?: boolean; tableNames?: string[]; services?: SourceTableService[] } = {}) {
  const services = new Map((opts.services ?? [existingService()]).map((s) => [s.code.toLowerCase(), s]));
  const lookup = {
    services: jest.fn(() => Promise.resolve(services)),
    logicals: jest.fn(() =>
      Promise.resolve(
        new Map([
          ['customer_cif', 70],
          ['date_of_birth', 71],
        ]),
      ),
    ),
    tableNames: jest.fn(() => Promise.resolve(new Set(opts.tableNames ?? []))),
  };
  const access = {
    writableDepartmentIds: jest.fn(() => Promise.resolve(null)),
    hasCode: jest.fn(() => Promise.resolve(opts.canUpdate ?? true)),
  };
  const snapshots = {
    // A service created by an import with no consumers.
    loadVersion: jest.fn(() =>
      Promise.resolve({
        source: {
          name: 'svc',
          short_description: 'd',
          purpose: null,
          usage_guide_html: '',
          request_unit_id: 1,
          division_id: 1,
          department_id: 2,
          consumer_ids: [],
          requester_user_ids: [9],
          it_supporter_user_ids: [9],
          service_owner_user_ids: [9],
          api_spec: { method: 'GET' },
          sftp_spec: null,
        },
      }),
    ),
  };
  const writeService = {
    update: jest.fn(() => Promise.resolve({ id: 7, service_code: 'API_EDA_C360_7', version_id: 71, version_no: 2 })),
  };
  const service = new SourceTableImportService(
    { manager: {} } as never,
    lookup as never,
    access as never,
    snapshots as never,
    writeService as never,
  );
  return { service, writeService };
}

async function edit(file: Buffer, change: (sheet: ExcelJS.Worksheet) => void) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as unknown as ArrayBuffer);
  change(wb.getWorksheet(SHEET));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

type Body = { consumer_ids: number[]; changelog_note: string; source_tables: Array<Record<string, any>> };
const bodyOf = (h: ReturnType<typeof harness>): Body => (h.writeService.update.mock.calls[0] as unknown[])[1] as Body;

describe('SourceTableImportService', () => {
  it('template has exactly one data sheet', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await exampleFile()) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual([SHEET]);
  });

  it('dry run of the example: valid, nothing written', async () => {
    const h = harness();
    const res = await h.service.import(await exampleFile(), true, CALLER);
    expect(res.issues).toEqual([]);
    expect(res.summary.rows).toEqual({ total: 3, valid: 3, updated: 0, failed: 0 });
    expect(res.summary.services).toEqual({ total: 1, valid: 1, updated: 0, failed: 0 });
    expect(h.writeService.update).not.toHaveBeenCalled();
  });

  it('writes one new version keeping the existing table and the service consumers (none), adding the new table', async () => {
    const h = harness();
    const res = await h.service.import(await exampleFile(), false, CALLER);
    expect(res.summary.services.updated).toBe(1);
    expect(res.source_tables[0]).toMatchObject({ status: 'updated', id: 7, version_no: 2 });
    expect(h.writeService.update).toHaveBeenCalledTimes(1);
    const body = bodyOf(h);
    expect(body.changelog_note).toBe('Import bảng nguồn & thuật ngữ nghiệp vụ');
    expect(body.consumer_ids).toEqual([]);
    expect(body.source_tables).toHaveLength(2);
    expect(body.source_tables[0]).toMatchObject({ id: 500, name: 'OWN_TABLE', terms: [{ id: 900, code: 'OLD_COL' }] });
    expect(body.source_tables[1].id).toBeUndefined();
    expect(body.source_tables[1].terms.map((t: any) => [t.code, t.is_required, t.logical_term_id])).toEqual([
      ['CIF_NO', true, 70],
      ['DOB', false, 71],
      ['FULL_NAME', true, null],
    ]);
  });

  it('appends terms to a table the service already uses, without a name conflict', async () => {
    const h = harness({ tableNames: ['own_table'] });
    const file = await edit(await exampleFile(), (s) => {
      for (const r of [2, 3, 4]) s.getCell(`B${r}`).value = 'own_table';
    });
    const res = await h.service.import(file, false, CALLER);
    expect(res.issues).toEqual([]);
    const body = bodyOf(h);
    expect(body.source_tables).toHaveLength(1);
    expect(body.source_tables[0].terms.map((t: any) => t.code)).toEqual(['OLD_COL', 'CIF_NO', 'DOB', 'FULL_NAME']);
  });

  it('reports by cell and applies nothing when one row of the service is bad', async () => {
    const h = harness({ tableNames: ['other_table'] });
    const file = await edit(await exampleFile(), (s) => {
      s.getCell('I2').value = 'NO_SUCH_LOGICAL';
      s.getCell('D4').value = 'dob';
    });
    const res = await h.service.import(file, false, CALLER);
    const at = (cell: string) => res.issues.filter((i) => `${i.column}${i.row}` === cell).map((i) => i.code);
    expect(at('I2')).toEqual(['LOGICAL_TERM_NOT_FOUND']);
    expect(at('D4')).toEqual(['PHYSICAL_CODE_DUPLICATE']);
    expect(h.writeService.update).not.toHaveBeenCalled();
    expect(res.source_tables.map((e) => e.status)).toEqual(['failed', 'skipped', 'failed']);
  });

  it('rejects an existing table of another service, an unknown service, a code already in the own table and a missing permission', async () => {
    const h = harness({ tableNames: ['c360_x'] });
    const file = await edit(await exampleFile(), (s) => {
      s.getCell('B2').value = 'C360_X';
      s.getCell('B3').value = 'OWN_TABLE';
      s.getCell('D3').value = 'old_col';
      s.getCell('A4').value = 'NO_SUCH_SERVICE';
    });
    const res = await h.service.import(file, true, CALLER);
    const at = (cell: string) => res.issues.filter((i) => `${i.column}${i.row}` === cell).map((i) => i.code);
    expect(at('B2')).toEqual(['SOURCE_TABLE_NAME_EXISTS']);
    expect(at('D3')).toEqual(['PHYSICAL_CODE_EXISTS']);
    expect(at('A4')).toEqual(['SERVICE_NOT_FOUND']);

    const denied = await harness({ canUpdate: false }).service.import(await exampleFile(), true, CALLER);
    expect(denied.issues.map((i) => i.code)).toEqual(['PERMISSION_DENIED', 'PERMISSION_DENIED', 'PERMISSION_DENIED']);
  });

  it('a failing update marks the service rows and does not throw', async () => {
    const h = harness();
    h.writeService.update.mockImplementationOnce(() =>
      Promise.reject(new ConflictException('SOURCE_TABLE_NAME_EXISTS')),
    );
    const res = await h.service.import(await exampleFile(), false, CALLER);
    expect(res.summary.services).toEqual({ total: 1, valid: 0, updated: 0, failed: 1 });
    expect(res.issues[0]).toMatchObject({ code: 'UPDATE_FAILED', message: 'SOURCE_TABLE_NAME_EXISTS' });
    const out = new ExcelJS.Workbook();
    await out.xlsx.load(Buffer.from(res.result_file.content_base64, 'base64') as unknown as ArrayBuffer);
    expect(cellText(out.getWorksheet(SHEET).getCell(1, 10).value)).toBe('Kết quả');
  });
});
