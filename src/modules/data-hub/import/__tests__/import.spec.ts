import { BadRequestException, ConflictException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { DataHubServiceType } from '@modules/databases/data-hub-enums';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as ExcelJS from 'exceljs';
import { DH_PERMISSIONS as P } from '../../common/data-hub-permission-codes';
import { DATA_HUB_PERMISSION_KEY } from '../../common/data-hub-permission.guard';
import { CreateConsumerDto } from '../../consumer/dto';
import { CreateDataServiceDto, UpdateDataServiceDto } from '../../data-service/dto';
import { LogicalTermBodyDto } from '../../dictionary/dto';
import {
  ConsumerImportController,
  DataServiceImportController,
  LogicalTermImportController,
  SourceTableImportController,
} from '../data-hub-import.controller';
import { ImportDataServiceDto, LogicalTermImportRowDto } from '../import-dto';
import { CONSUMER_IMPORT_LAYOUT, SERVICE_IMPORT_LAYOUTS, ServiceImportKind } from '../import-layouts';
import { DataServiceImportTemplateService } from '../import-templates.service';
import { ImportReferences } from '../import-lookups.service';
import { ConsumerImportTemplateService, LogicalTermImportTemplateService } from '../import-templates.service';
import { ConsumerImportService, DataServiceImportService, LogicalTermImportService } from '../import.service';
import { cellText, headerText, sheetDef } from '../import-workbook.util';

// ---- routes
{
  type Ctor = { prototype: Record<string, unknown> };

  // Template download and upload of each import need the code of the write it performs.
  type Case = [string, Ctor, string, string, string];
  const EXPECTED: Case[] = [
    ['consumer imports', ConsumerImportController as unknown as Ctor, 'template', 'import', P.CONSUMER_CREATE],
    [
      'logical term imports',
      LogicalTermImportController as unknown as Ctor,
      'template',
      'import',
      P.LOGICAL_TERM_CREATE,
    ],
    [
      'API service imports',
      DataServiceImportController as unknown as Ctor,
      'apiTemplate',
      'importApi',
      P.DATA_SERVICE_CREATE,
    ],
    [
      'SFTP service imports',
      DataServiceImportController as unknown as Ctor,
      'sftpTemplate',
      'importSftp',
      P.DATA_SERVICE_CREATE,
    ],
    [
      'source table imports',
      SourceTableImportController as unknown as Ctor,
      'template',
      'import',
      P.DATA_SERVICE_UPDATE,
    ],
  ];

  describe.each(EXPECTED)('%s', (_name, ctrl, template, upload, code) => {
    it.each([
      [template, RequestMethod.GET],
      [upload, RequestMethod.POST],
    ])('%s is gated by the code', (handler, method) => {
      const fn = ctrl.prototype[handler] as object;
      expect(Reflect.getMetadata(METHOD_METADATA, fn)).toBe(method);
      expect(Reflect.getMetadata(DATA_HUB_PERMISSION_KEY, fn)).toEqual([code]);
    });
  });
}

// ---- requirement
{
  const base = {
    service_type: 'API',
    name: 'n',
    short_description: 'd',
    request_unit_id: 1,
    division_id: 1,
    department_id: 1,
    requester_user_ids: [1],
    it_supporter_user_ids: [1],
    service_owner_user_ids: [1],
    api_spec: {
      method: 'GET',
      base_url: 'API_INT',
      endpoint_path: '/x',
      auth_type: 'BEARER_TOKEN',
      update_frequency: 'REALTIME',
      sync_mode: 'ASYNC',
    },
  };

  describe('0 consumers is an import-only relaxation', () => {
    it('POST and PUT bodies still require 1..20 consumers', async () => {
      const create = await validate(plainToInstance(CreateDataServiceDto, { ...base, consumer_ids: [] }));
      expect(create.map((e) => e.property)).toContain('consumer_ids');
      const update = await validate(
        plainToInstance(UpdateDataServiceDto, { ...base, source_tables: [], consumer_ids: [] }),
      );
      expect(update.map((e) => e.property)).toContain('consumer_ids');
    });

    it('the import DTO accepts none, but still caps at 20', async () => {
      expect(await validate(plainToInstance(ImportDataServiceDto, base))).toEqual([]);
      const many = Array.from({ length: 21 }, (_, i) => i + 1);
      const res = await validate(plainToInstance(ImportDataServiceDto, { ...base, consumer_ids: many }));
      expect(res.map((e) => e.property)).toEqual(['consumer_ids']);
    });
  });
}

// ---- consumers
{
  const CALLER = { id: 1, type: 'super_admin' };
  const SHEET = sheetDef(CONSUMER_IMPORT_LAYOUT, 'CONSUMERS').name;

  function harness(existing: string[] = []) {
    const dataSource = {
      query: jest.fn((sql: string) => {
        if (sql.includes('data_hub_divisions')) {
          return sql.includes('t.name') ? [{ code: 'EDA', name: 'EDA' }] : [{ id: 1, code: 'EDA' }];
        }
        if (sql.includes('FROM users u')) return [{ id: 9, email: 'so@vpbank.com.vn' }];
        if (sql.includes('FROM data_hub_consumers c')) return existing.map((code) => ({ code }));
        return [];
      }),
    };
    const created: CreateConsumerDto[] = [];
    const writeService = {
      create: jest.fn((dto: CreateConsumerDto) => {
        created.push(dto);
        return Promise.resolve({ id: 100 + created.length, code: dto.code, version_no: 1 });
      }),
    };
    const service = new ConsumerImportService(dataSource as never, writeService as never);
    const template = new ConsumerImportTemplateService(dataSource as never);
    return { service, template, writeService, created };
  }

  async function edit(file: Buffer, change: (sheet: ExcelJS.Worksheet) => void): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file as unknown as ArrayBuffer);
    change(wb.getWorksheet(SHEET));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  describe('ConsumerImportService', () => {
    it('template has exactly one data sheet', async () => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load((await harness().template.build({ email: 'so@vpbank.com.vn' })) as unknown as ArrayBuffer);
      expect(wb.worksheets.map((w) => w.name)).toEqual(['APP_THU_HUONG']);
    });

    it('dry run of the example: valid, nothing written', async () => {
      const h = harness();
      const file = await h.template.build({ email: 'so@vpbank.com.vn' });
      const res = await h.service.import(file, true, CALLER);
      expect(res.issues).toEqual([]);
      expect(res.summary.consumers).toEqual({ total: 2, valid: 2, created: 0, failed: 0 });
      expect(h.writeService.create).not.toHaveBeenCalled();
    });

    it('creates each valid row with the upper-cased code and resolved ids', async () => {
      const h = harness();
      const file = await edit(await h.template.build({ email: 'so@vpbank.com.vn' }), (s) => {
        s.getCell('A2').value = 'app_lower_1';
      });
      const res = await h.service.import(file, false, CALLER);
      expect(res.summary.consumers.created).toBe(2);
      expect(h.created[0]).toMatchObject({ code: 'APP_LOWER_1', division_id: 1, so_app_user_ids: [9] });
      expect(res.consumers[0]).toMatchObject({ status: 'created', id: 101, code: 'APP_LOWER_1' });
    });

    it('reports a code in the database, a duplicate in the file, a bad email and a bad category by cell', async () => {
      const h = harness(['TAKEN_APP']);
      const file = await edit(await h.template.build({ email: 'so@vpbank.com.vn' }), (s) => {
        s.getCell('A2').value = 'TAKEN_APP';
        s.getCell('A3').value = 'DUP_APP';
        s.getRow(4).values = ['DUP_APP', 'n', 'BAD', 'EDA', 'd', 'nobody@x.vn'];
      });
      const res = await h.service.import(file, false, CALLER);
      const at = (cell: string) => res.issues.filter((i) => `${i.column}${i.row}` === cell).map((i) => i.code);
      expect(at('A2')).toEqual(['CONSUMER_CODE_EXISTS']);
      expect(at('A3')).toEqual(['DUPLICATE_IN_FILE']);
      expect(at('A4')).toEqual(['DUPLICATE_IN_FILE']);
      expect(at('C4')).toEqual(['INVALID_VALUE']);
      expect(at('F4')).toEqual(['USER_NOT_FOUND']);
      expect(h.writeService.create).not.toHaveBeenCalled();
    });

    it('keeps going when one create fails', async () => {
      const h = harness();
      h.writeService.create.mockImplementationOnce(() => Promise.reject(new ConflictException('CONSUMER_CODE_EXISTS')));
      const res = await h.service.import(await h.template.build({ email: 'so@vpbank.com.vn' }), false, CALLER);
      expect(res.consumers.map((c) => c.status)).toEqual(['failed', 'created']);
      expect(res.issues[0]).toMatchObject({ row: 2, code: 'CREATE_FAILED' });
    });
  });
}

// ---- logical
{
  const CALLER = { id: 1, type: 'super_admin' };

  function harness(existing: string[] = []) {
    const dataSource = { query: jest.fn(() => existing.map((code) => ({ code }))) };
    const writeService = {
      create: jest.fn((dto: { code: string }) => Promise.resolve({ id: 500, code: dto.code, version_no: 1 })),
    };
    return {
      service: new LogicalTermImportService(dataSource as never, writeService as never),
      template: new LogicalTermImportTemplateService(),
      writeService,
    };
  }

  async function edit(file: Buffer, change: (sheet: ExcelJS.Worksheet) => void): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file as unknown as ArrayBuffer);
    change(wb.getWorksheet('THUAT_NGU_CHUAN_HOA'));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  describe('LogicalTermImportService', () => {
    it('template has exactly one data sheet', async () => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load((await harness().template.build(true)) as unknown as ArrayBuffer);
      expect(wb.worksheets.map((w) => w.name)).toEqual(['THUAT_NGU_CHUAN_HOA']);
    });

    it('creates terms with an empty physical mapping', async () => {
      const h = harness();
      const res = await h.service.import(await h.template.build(true), false, CALLER);
      expect(res.issues).toEqual([]);
      expect(res.summary.logical_terms.created).toBe(2);
      expect(h.writeService.create.mock.calls[0]).toEqual([expect.objectContaining({ physical_term_ids: [] }), 1]);
    });

    it('dry run writes nothing; code in the database and in the file are errors', async () => {
      const h = harness(['taken_code']);
      const file = await edit(await h.template.build(true), (s) => {
        s.getCell('A2').value = 'TAKEN_CODE';
        s.getCell('A3').value = 'A_NEW';
        s.getRow(4).values = ['a_new', 'x'];
      });
      const res = await h.service.import(file, true, CALLER);
      const at = (cell: string) => res.issues.filter((i) => `${i.column}${i.row}` === cell).map((i) => i.code);
      expect(at('A2')).toEqual(['LOGICAL_TERM_CODE_EXISTS']);
      expect(at('A3')).toEqual(['DUPLICATE_IN_FILE']);
      expect(at('A4')).toEqual(['DUPLICATE_IN_FILE']);
      expect(h.writeService.create).not.toHaveBeenCalled();
    });
  });

  describe('a logical term needs no physical term', () => {
    const body = { code: 'X', short_description: 'd' };
    it('LogicalTermBodyDto accepts an empty or omitted mapping (omitted = []), still validates given ids', async () => {
      expect(await validate(plainToInstance(LogicalTermBodyDto, { ...body, physical_term_ids: [] }))).toEqual([]);
      const omitted = plainToInstance(LogicalTermBodyDto, body);
      expect(await validate(omitted)).toEqual([]);
      expect(omitted.physical_term_ids).toEqual([]);
      const bad = await validate(plainToInstance(LogicalTermBodyDto, { ...body, physical_term_ids: [0, 0] }));
      expect(bad.map((e) => e.property)).toEqual(['physical_term_ids']);
      expect(await validate(plainToInstance(LogicalTermImportRowDto, body))).toEqual([]);
    });
  });
}

// ---- services
{
  const CALLER = { id: 1, type: 'super_admin' };
  const sheetOf = (kind: ServiceImportKind) => sheetDef(SERVICE_IMPORT_LAYOUTS[kind], 'SERVICES');

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

  const exampleFile = (kind: ServiceImportKind = 'API') =>
    new DataServiceImportTemplateService(templateDataSource as never).build(kind, { email: 'so@vpbank.com.vn' });

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
    writableDepartmentIds: null,
  });

  async function edit(file: Buffer, kind: ServiceImportKind, change: (sheet: ExcelJS.Worksheet) => void) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file as unknown as ArrayBuffer);
    change(wb.getWorksheet(sheetOf(kind).name));
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
    const lookup = { load: jest.fn(() => Promise.resolve(refs)) };
    const service = new DataServiceImportService(lookup as never, writeService as never);
    return { service, writeService, created };
  }

  describe('data service import templates', () => {
    it.each(['API', 'SFTP'] as const)(
      '%s template has exactly one data sheet with the layout headers',
      async (kind) => {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load((await exampleFile(kind)) as unknown as ArrayBuffer);
        expect(wb.worksheets.map((w) => w.name)).toEqual([kind === 'API' ? 'DICH_VU_API' : 'DICH_VU_SFTP']);
        const sheet = wb.worksheets[0];
        sheetOf(kind).columns.forEach((c, i) => expect(cellText(sheet.getCell(1, i + 1).value)).toBe(headerText(c)));
        // The "Mã tham chiếu" column of the old combined file is gone; consumers are optional.
        expect(sheetOf(kind).columns.map((c) => c.key)).not.toContain('ref');
        expect(sheetOf(kind).columns.find((c) => c.key === 'consumers')?.level).toBe('o');
      },
    );

    it('enum columns carry an in-cell dropdown', () => {
      const method = sheetOf('API').columns.find((c) => c.key === 'method');
      expect(method?.options).toContain('GET');
    });
  });

  describe('DataServiceImportService', () => {
    it('dry run of the API example: every row valid and nothing written', async () => {
      const h = harness();
      const res = await h.service.import('API', await exampleFile(), true, CALLER);
      expect(res.issues).toEqual([]);
      expect(res.summary.services).toEqual({ total: 2, valid: 2, created: 0, failed: 0 });
      expect(h.writeService.create).not.toHaveBeenCalled();
    });

    it('creates each API row through the create payload with the consumers picked by code', async () => {
      const h = harness();
      const res = await h.service.import('API', await exampleFile(), false, CALLER);
      expect(res.summary.services.created).toBe(2);
      expect(h.created[0]).toMatchObject({
        service_type: DataHubServiceType.API,
        request_unit_id: 3,
        division_id: 1,
        department_id: 2,
        consumer_ids: [40, 41],
        service_owner_user_ids: [9],
        api_spec: { method: 'GET', sync_mode: 'SYNC', timeout: '3000', sample_request: { cif: '10012345' } },
      });
      expect(h.created[0].source_tables).toBeUndefined();
      expect(res.services[0]).toMatchObject({ status: 'created', id: 100, service_code: 'API_EDA_C360_100' });
    });

    it('creates an SFTP row with its spec', async () => {
      const h = harness();
      const res = await h.service.import('SFTP', await exampleFile('SFTP'), false, CALLER);
      expect(res.summary.services.created).toBe(1);
      expect(h.created[0]).toMatchObject({
        service_type: DataHubServiceType.SFTP,
        sftp_spec: { folder_path: '/outbound/card/', encryption: 'PGP_KEY' },
      });
    });

    it('creates a service with no consumers when the cell is empty (import-only relaxation)', async () => {
      const file = await edit(await exampleFile(), 'API', (s) => (s.getCell('G2').value = null));
      const h = harness();
      const res = await h.service.import('API', file, false, CALLER);
      expect(res.issues).toEqual([]);
      expect(h.writeService.create.mock.calls[0][0]).toMatchObject({ consumer_ids: [] });
    });

    it('rejects an unknown or inactive consumer by cell and creates nothing for that row', async () => {
      const refs = references();
      refs.consumers.set('app_los', { id: 41, active: false });
      const file = await edit(await exampleFile(), 'API', (s) => (s.getCell('G3').value = 'NO_SUCH_APP'));
      const h = harness(refs);
      const res = await h.service.import('API', file, false, CALLER);
      const at = (cell: string) => res.issues.filter((i) => `${i.column}${i.row}` === cell).map((i) => i.code);
      expect(at('G2')).toEqual(['CONSUMER_INACTIVE']);
      expect(at('G3')).toEqual(['CODE_NOT_FOUND']);
      expect(h.writeService.create).not.toHaveBeenCalled();
    });

    it('reports problems by cell, annotates the result file and keeps going past a failed create', async () => {
      const refs = references();
      refs.users.delete('so@vpbank.com.vn');
      const h = harness(refs);
      const res = await h.service.import('API', await exampleFile(), false, CALLER);
      expect(res.issues.filter((i) => i.column === 'H').map((i) => i.code)).toEqual([
        'USER_NOT_FOUND',
        'USER_NOT_FOUND',
      ]);
      const out = new ExcelJS.Workbook();
      await out.xlsx.load(Buffer.from(res.result_file.content_base64, 'base64') as unknown as ArrayBuffer);
      const sheet = out.getWorksheet('DICH_VU_API');
      const status = sheetOf('API').columns.length + 1;
      expect(cellText(sheet.getCell(1, status).value)).toBe('Kết quả');
      expect(cellText(sheet.getCell(2, status).value)).toBe('Lỗi');

      const h2 = harness();
      h2.writeService.create.mockImplementationOnce(() => Promise.reject(new ConflictException('SERVICE_CODE_EXISTS')));
      const res2 = await h2.service.import('API', await exampleFile(), false, CALLER);
      expect(res2.services.map((s) => s.status)).toEqual(['failed', 'created']);
      expect(res2.issues).toEqual([expect.objectContaining({ row: 2, code: 'CREATE_FAILED' })]);
    });

    it('rejects a file whose sheet or headers do not match the template', async () => {
      const file = await edit(await exampleFile(), 'API', (s) => (s.getCell('A1').value = 'Name'));
      await expect(harness().service.import('API', file, true, CALLER)).rejects.toThrow(BadRequestException);
      await expect(harness().service.import('SFTP', await exampleFile('API'), true, CALLER)).rejects.toThrow(
        /INVALID_TEMPLATE/,
      );
    });
  });

  describe('DataServiceImportService - concurrent imports', () => {
    it('refuses a second real import from the same user while one is running; a dry run is never blocked', async () => {
      const h = harness();
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      h.writeService.create.mockImplementationOnce(async (dto: CreateDataServiceDto) => {
        await gate;
        h.created.push(dto);
        return { id: 100, service_code: 'API_EDA_C360_100', version_id: 100, version_no: 1 };
      });
      const file = await exampleFile();
      const first = h.service.import('API', file, false, CALLER);
      await new Promise((r) => setTimeout(r, 50));
      await expect(h.service.import('API', file, false, CALLER)).rejects.toThrow(/IMPORT_IN_PROGRESS/);
      await expect(h.service.import('API', file, true, CALLER)).resolves.toBeDefined();
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
}
