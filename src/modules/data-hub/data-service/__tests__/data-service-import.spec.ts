import { BadRequestException, ConflictException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as JSZip from 'jszip';
import { DataHubServiceType } from '@modules/databases/data-hub-enums';
import { CreateDataServiceDto } from '../dto';
import { DataServiceImportService } from '../import/data-service-import.service';
import { ImportReferences } from '../import/data-service-import-reference-lookup.service';
import { IMPORT_SHEETS, SHEET_COLUMNS, headerText } from '../import/data-service-import-sheet-columns';
import { DataServiceImportTemplateService } from '../import/data-service-import-template.service';
import { cellText } from '../import/data-service-import-workbook-reader.util';

const CALLER = { id: 1, type: 'super_admin' };

// DANH_MUC source rows, answered by table name.
const templateDataSource = {
  query: jest.fn((sql: string) => {
    if (sql.includes('data_hub_request_units')) return [{ code: 'AF', name: 'Tài chính' }];
    if (sql.includes('data_hub_divisions')) return [{ code: 'EDA', name: 'EDA' }];
    if (sql.includes('data_hub_departments')) return [{ code: 'C360', name: 'C360' }];
    if (sql.includes('data_hub_consumers'))
      return [
        { code: 'APP_CRM', name: 'CRM' },
        { code: 'APP_LOS', name: 'LOS' },
      ];
    return [];
  }),
};

const exampleFile = () =>
  new DataServiceImportTemplateService(templateDataSource as never).build({ email: 'so@vpbank.com.vn' });

// Lookups as the example rows expect them; tests remove entries to plant errors.
const references = (): ImportReferences => ({
  requestUnits: new Map([['af', 3]]),
  divisions: new Map([['eda', 1]]),
  departments: new Map([['c360', 2]]),
  consumers: new Map([
    ['app_crm', { id: 40, active: true }],
    ['app_los', { id: 41, active: true }],
  ]),
  users: new Map([['so@vpbank.com.vn', 9]]),
  logicalTerms: new Map(),
  sourceTableNames: new Set(),
  writableDepartmentIds: null,
  canCreateLogical: true,
});

async function edit(file: Buffer, change: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as unknown as ArrayBuffer);
  change(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function harness(refs = references()) {
  let nextId = 100;
  const created: CreateDataServiceDto[] = [];
  const writeService = {
    create: jest.fn((dto: CreateDataServiceDto) => {
      created.push(dto);
      const id = nextId++;
      return Promise.resolve({ id, service_code: `API_EDA_C360_${id}`, version_id: id, version_no: 1 });
    }),
  };
  const logicalWrite = { create: jest.fn(() => Promise.resolve({ id: 500, code: 'x', version_no: 1 })) };
  // Physical terms of a created service, rebuilt from the DTO that created it.
  const dataSource = {
    query: jest.fn((_sql: string, [serviceId]: number[]) => {
      const dto = created[serviceId - 100];
      return (dto.source_tables ?? []).flatMap((t, i) =>
        t.terms.map((term, j) => ({ id: serviceId * 1000 + i * 100 + j, table_name: t.name, code: term.code })),
      );
    }),
  };
  const lookup = { load: jest.fn(() => Promise.resolve(refs)) };
  const service = new DataServiceImportService(
    dataSource as never,
    lookup as never,
    writeService as never,
    logicalWrite as never,
  );
  return { service, writeService, logicalWrite, created };
}

describe('data service import template', () => {
  it('has the fixed sheet names, the column headers and DANH_MUC filled from the database', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await exampleFile()) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'HUONG_DAN',
      'DICH_VU_API',
      'DICH_VU_SFTP',
      'BANG_NGUON_PHYSICAL_TERM',
      'LOGICAL_TERM_MOI',
      'DANH_MUC',
    ]);
    const api = wb.getWorksheet(IMPORT_SHEETS.API);
    SHEET_COLUMNS.API.forEach((c, i) => expect(cellText(api.getCell(1, i + 1).value)).toBe(headerText(c)));
    const lists = wb.getWorksheet(IMPORT_SHEETS.LISTS);
    expect(cellText(lists.getCell('A2').value)).toBe('AF');
    expect(cellText(lists.getCell('G3').value)).toBe('APP_LOS');
  });
});

describe('DataServiceImportService', () => {
  it('dry run of the example file: every row valid and nothing written', async () => {
    const h = harness();
    const res = await h.service.import(await exampleFile(), true, CALLER);
    expect(res.issues).toEqual([]);
    expect(res.summary.services).toEqual({ total: 3, valid: 3, created: 0, failed: 0 });
    expect(res.summary.logical_terms).toEqual({ total: 2, valid: 2, created: 0, failed: 0 });
    expect(h.writeService.create).not.toHaveBeenCalled();
    expect(h.logicalWrite.create).not.toHaveBeenCalled();
  });

  it('creates each service through the create API payload and maps the new logical terms to the created physicals', async () => {
    const h = harness();
    const res = await h.service.import(await exampleFile(), false, CALLER);
    expect(res.summary.services.created).toBe(3);
    const [api01, , sf01] = h.created;
    expect(api01).toBeInstanceOf(CreateDataServiceDto);
    expect(api01).toMatchObject({
      service_type: DataHubServiceType.API,
      request_unit_id: 3,
      division_id: 1,
      department_id: 2,
      consumer_ids: [40, 41],
      service_owner_user_ids: [9],
      api_spec: { method: 'GET', sync_mode: 'SYNC', timeout: '3000', sample_request: { cif: '10012345' } },
    });
    expect(api01.source_tables).toHaveLength(2);
    expect(api01.source_tables[0].terms[0]).toMatchObject({
      code: 'CIF_NO',
      data_type: 'VARCHAR(20)',
      is_required: true,
      example_value: '0010012345',
      logical_term_id: null,
    });
    expect(sf01).toMatchObject({
      service_type: DataHubServiceType.SFTP,
      sftp_spec: { port: 22, encryption: 'PGP_KEY' },
    });
    // CUSTOMER_CIF is used by API01 and API02 (one CIF_NO each), DATE_OF_BIRTH by API01 only.
    const calls = h.logicalWrite.create.mock.calls as unknown as Array<[{ code: string; physical_term_ids: number[] }]>;
    expect(calls.map(([b]) => [b.code.replace(/_\d+$/, ''), b.physical_term_ids])).toEqual([
      ['CUSTOMER_CIF', [100000, 101000]],
      ['DATE_OF_BIRTH', [100002]],
    ]);
    expect(res.summary.logical_terms.created).toBe(2);
  });

  it('reports problems by cell and never creates a service with a bad row', async () => {
    const refs = references();
    refs.users.delete('so@vpbank.com.vn');
    const file = await edit(await exampleFile(), (wb) => {
      wb.getWorksheet(IMPORT_SHEETS.SFTP).getCell('A2').value = 'API02';
      wb.getWorksheet(IMPORT_SHEETS.TERMS).getCell('I8').value = 'NO_SUCH_LOGICAL';
    });
    const h = harness(refs);
    const res = await h.service.import(file, false, CALLER);
    const at = (sheet: string, cell: string) =>
      res.issues.filter((i) => i.sheet === sheet && `${i.column}${i.row}` === cell).map((i) => i.code);
    expect(at('API', 'I2')).toEqual(['USER_NOT_FOUND']);
    expect(at('SFTP', 'A2')).toEqual(['DUPLICATE_REF']);
    expect(at('TERMS', 'I8')).toEqual(['LOGICAL_TERM_NOT_FOUND']);
    expect(res.summary.services.created).toBe(0);
    expect(h.writeService.create).not.toHaveBeenCalled();
    const out = new ExcelJS.Workbook();
    await out.xlsx.load(Buffer.from(res.result_file.content_base64, 'base64') as unknown as ArrayBuffer);
    const api = out.getWorksheet(IMPORT_SHEETS.API);
    expect(cellText(api.getCell(1, SHEET_COLUMNS.API.length + 1).value)).toBe('Kết quả');
    expect(cellText(api.getCell(2, SHEET_COLUMNS.API.length + 1).value)).toBe('Lỗi');
  });

  it('rejects a table name already in the system and a logical code that already exists', async () => {
    const refs = references();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await exampleFile()) as unknown as ArrayBuffer);
    const table = cellText(wb.getWorksheet(IMPORT_SHEETS.TERMS).getCell('B2').value).toLowerCase();
    const logical = cellText(wb.getWorksheet(IMPORT_SHEETS.LOGICAL).getCell('A3').value).toLowerCase();
    refs.sourceTableNames.add(table);
    refs.logicalTerms.set(logical, 77);
    const res = await harness(refs).service.import(await exampleFile(), true, CALLER);
    expect(res.issues.find((i) => i.sheet === 'TERMS' && i.row === 2)?.code).toBe('SOURCE_TABLE_NAME_EXISTS');
    expect(res.issues.find((i) => i.sheet === 'LOGICAL' && i.row === 3)?.code).toBe('LOGICAL_TERM_CODE_EXISTS');
    expect(res.services.find((s) => s.ref === 'API01')?.status).toBe('failed');
    expect(res.services.find((s) => s.ref === 'SF01')?.status).toBe('valid');
  });

  it('keeps going when one create fails, and skips a logical term whose only service failed', async () => {
    const h = harness();
    h.writeService.create.mockImplementationOnce(() =>
      Promise.reject(new ConflictException('SOURCE_TABLE_NAME_EXISTS')),
    );
    const res = await h.service.import(await exampleFile(), false, CALLER);
    expect(res.services.map((s) => s.status)).toEqual(['failed', 'created', 'created']);
    expect(res.issues).toEqual([
      expect.objectContaining({ sheet: 'API', row: 2, code: 'CREATE_FAILED', message: 'SOURCE_TABLE_NAME_EXISTS' }),
    ]);
    // DATE_OF_BIRTH was used only by API01: not created; CUSTOMER_CIF still maps API02's term.
    expect(h.logicalWrite.create).toHaveBeenCalledTimes(1);
    expect(res.summary.logical_terms.created).toBe(1);
  });

  it('rejects a file whose sheets or headers do not match the template', async () => {
    const file = await edit(await exampleFile(), (wb) => {
      wb.getWorksheet(IMPORT_SHEETS.API).getCell('B1').value = 'Name';
    });
    await expect(harness().service.import(file, true, CALLER)).rejects.toThrow(BadRequestException);
  });
});

describe('DataServiceImportService — hostile and edge-case files', () => {
  it('reads only stored rows: one formatted cell at the last Excel row does not loop a million rows', async () => {
    const file = await edit(await exampleFile(), (wb) => {
      wb.getWorksheet(IMPORT_SHEETS.TERMS).getCell('A1048576').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF0000' },
      };
    });
    const started = Date.now();
    const res = await harness().service.import(file, true, CALLER);
    expect(res.summary.term_rows.total).toBe(8);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('rejects a validation over a whole column before exceljs expands it', async () => {
    const zip = await JSZip.loadAsync(await exampleFile());
    const name = 'xl/worksheets/sheet2.xml';
    const xml = await zip.file(name).async('string');
    zip.file(
      name,
      xml.replace(
        '</sheetData>',
        '</sheetData><dataValidations count="1"><dataValidation type="list" sqref="A2:H1048576"><formula1>"a"</formula1></dataValidation></dataValidations>',
      ),
    );
    const file = await zip.generateAsync({ type: 'nodebuffer' });
    await expect(harness().service.import(file, true, CALLER)).rejects.toThrow(/INVALID_FILE/);
  });

  it('reads a hyperlink whose text is rich text (an email pasted with formatting)', () => {
    const value = { text: { richText: [{ text: 'so@' }, { text: 'vpbank.com.vn' }] }, hyperlink: 'mailto:x' };
    expect(cellText(value as unknown as ExcelJS.CellValue)).toBe('so@vpbank.com.vn');
  });

  it('flags the term rows when their new logical term cannot be created after the services', async () => {
    const h = harness();
    h.logicalWrite.create.mockImplementationOnce(() =>
      Promise.reject(new ConflictException('LOGICAL_TERM_CODE_EXISTS')),
    );
    const res = await h.service.import(await exampleFile(), false, CALLER);
    expect(res.summary.services.created).toBe(3);
    // CUSTOMER_CIF is on API01 row 2 and API02 row 6 of the term sheet.
    const unmapped = res.issues.filter((i) => i.code === 'LOGICAL_NOT_MAPPED');
    expect(unmapped.map((i) => [i.sheet, i.row, i.warning])).toEqual([
      ['TERMS', 2, true],
      ['TERMS', 6, true],
    ]);
    expect(res.issues).toContainEqual(expect.objectContaining({ sheet: 'LOGICAL', row: 2, code: 'CREATE_FAILED' }));
  });

  it('fails in the dry run when a new logical term would get more physicals than its API allows', async () => {
    const file = await edit(await exampleFile(), (wb) => {
      const terms = wb.getWorksheet(IMPORT_SHEETS.TERMS);
      const table = cellText(terms.getCell('B2').value);
      const logical = cellText(terms.getCell('I2').value);
      for (let i = 0; i < 1000; i++) {
        terms.addRow(['API01', table, '', `COL_${i}`, 'd', 'INT', '', '', logical]);
      }
    });
    const h = harness();
    const res = await h.service.import(file, false, CALLER);
    const logicalIssue = res.issues.find((i) => i.sheet === 'LOGICAL' && i.row === 2);
    expect(logicalIssue?.code).toContain('TOO_MANY_PHYSICALS');
    expect(res.services.find((s) => s.ref === 'API01')?.status).toBe('failed');
    expect(h.created.some((d) => d.name.startsWith('Tra cứu'))).toBe(false);
  });

  it('refuses a second real import from the same user while one is running', async () => {
    const h = harness();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    h.writeService.create.mockImplementationOnce(async (dto: CreateDataServiceDto) => {
      await gate;
      h.created.push(dto);
      return { id: 100, service_code: 'API_EDA_C360_100', version_id: 100, version_no: 1 };
    });
    const file = await exampleFile();
    const first = h.service.import(file, false, CALLER);
    await new Promise((r) => setTimeout(r, 50));
    await expect(h.service.import(file, false, CALLER)).rejects.toThrow(/IMPORT_IN_PROGRESS/);
    // A dry run is never blocked.
    await expect(h.service.import(file, true, CALLER)).resolves.toBeDefined();
    release();
    await first;
  });
});

describe('cellText', () => {
  it('reads the text Excel shows for links, rich text, formulas, dates and numbers', () => {
    expect(cellText({ text: 'a@b.vn', hyperlink: 'mailto:a@b.vn' })).toBe('a@b.vn');
    expect(cellText({ richText: [{ text: 'Mô ' }, { text: 'tả' }] })).toBe('Mô tả');
    expect(cellText({ formula: 'A1', result: 'EDA' } as ExcelJS.CellFormulaValue)).toBe('EDA');
    expect(cellText(new Date(Date.UTC(1990, 4, 12)))).toBe('1990-05-12');
    expect(cellText(3000)).toBe('3000');
    expect(cellText(null)).toBe('');
  });
});
