import { ForbiddenException, RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { PERMISSION_META_KEY } from '@common/authorization/constants/authorization.constant';
import { BearerGuard } from '@common/guards/bearer.guard';
import { IsSuperAdminGuard } from '@common/guards/is-super-admin.guard';
import * as ExcelJS from 'exceljs';
import {
  ConsumerImportController,
  DataServiceImportController,
  LogicalTermImportController,
  SourceTableImportController,
} from '../data-hub-import.controller';
import {
  CONSUMER_IMPORT_LAYOUT,
  LOGICAL_TERM_IMPORT_LAYOUT,
  SERVICE_IMPORT_LAYOUTS,
  SOURCE_TABLE_IMPORT_LAYOUT,
} from '../import-layouts';
import {
  ConsumerImportTemplateService,
  DataServiceImportTemplateService,
  LogicalTermImportTemplateService,
  SourceTableImportTemplateService,
} from '../import-templates.service';
import {
  buildImportTemplate,
  cellText,
  ImportLayout,
  loadImportWorkbook,
  readSheetRows,
} from '../import-workbook.util';
import { loadBook } from './import-test-helpers';

// The agreed import templates: row 1 holds exactly these names, in this order.
const EXPECTED_HEADERS: Array<[string, ImportLayout, string[]]> = [
  ['logical term', LOGICAL_TERM_IMPORT_LAYOUT, ['STT', 'Thuật ngữ Chuẩn hoá (Logical Term)', 'Mô tả', 'Ví dụ']],
  [
    'API',
    SERVICE_IMPORT_LAYOUTS.API,
    [
      'STT',
      'Mã dịch vụ',
      'Tên dịch vụ API',
      'Mô tả ngắn',
      'Đơn vị yêu cầu',
      'App thụ hưởng',
      'Mục đích sử dụng',
      'Đầu mối yêu cầu',
      'IT hỗ trợ (email)',
      'IT hỗ trợ (sđt)',
      'IT hỗ trợ (link)',
      'Ops Dịch vụ',
      'Method',
      'Base-URL',
      'Path',
      'Cơ chế xác thực',
      'Mã hoá bảo mật',
      'Peak TPS',
      'Tần suất',
      'Cơ chế xử lý',
      'Thời gian timeout',
      'Sample Request Body',
      'Sample Response Payload',
      'Hướng dẫn sử dụng',
      'Khối chủ quản',
      'Đơn vị phát hành',
      'SO Dịch vụ',
    ],
  ],
  [
    'SFTP',
    SERVICE_IMPORT_LAYOUTS.SFTP,
    [
      'STT',
      'Mã dịch vụ',
      'Tên dịch vụ SFTP',
      'Mô tả ngắn',
      'Đơn vị yêu cầu',
      'App thụ hưởng',
      'Mục đích sử dụng',
      'Đầu mối yêu cầu',
      'IT hỗ trợ (email)',
      'IT hỗ trợ (sđt)',
      'IT hỗ trợ (link)',
      'Ops Dịch vụ',
      'Thư mục trên SFTP Server',
      'Tên file quy ước',
      'Chiều truyền',
      'Mã hoá bảo mật',
      'Định dạng file',
      'Tần suất',
      'Giới hạn dung lượng / file',
      'Hướng dẫn sử dụng',
      'Khối chủ quản',
      'Đơn vị phát hành',
      'SO Dịch vụ',
    ],
  ],
  [
    'App thụ hưởng',
    CONSUMER_IMPORT_LAYOUT,
    [
      'STT',
      'Mã định danh App',
      'Tên App thụ hưởng',
      'Hệ thống',
      'Dịch vụ hệ thống',
      'Phân loại',
      'Đơn vị chủ quản',
      'SO App',
      'Mô tả ngắn (VI)',
    ],
  ],
  [
    'bảng nguồn thuật ngữ',
    SOURCE_TABLE_IMPORT_LAYOUT,
    [
      'Mã dịch vụ',
      'Bảng nguồn dịch vụ (Full path)',
      'Cơ chế bảng (Cơ chế đồng bộ/cập nhật)',
      'Thuật ngữ Chuẩn hoá (Logical Term)',
      'Thuật ngữ Nghiệp vụ (Physical Term)',
      'Mô tả',
      'Kiểu dữ liệu',
      'Bắt buộc',
      'Ví dụ',
    ],
  ],
];

describe('import templates', () => {
  it.each(EXPECTED_HEADERS)('%s template: row 1 is exactly the agreed column names', async (_n, layout, headers) => {
    const wb = await loadBook(await buildImportTemplate({ layout }));
    expect(wb.worksheets).toHaveLength(1);
    const row1 = wb.worksheets[0].getRow(1);
    const written = headers.map((_h, i) => cellText(row1.getCell(i + 1).value));
    expect(written).toEqual(headers);
    expect(cellText(row1.getCell(headers.length + 1).value)).toBe('');
  });

  it('the STT column is never read: a row holding only an STT number is empty', async () => {
    const layout = LOGICAL_TERM_IMPORT_LAYOUT;
    const wb = await loadBook(await buildImportTemplate({ layout }));
    const sheet = wb.worksheets[0];
    sheet.getCell(2, 1).value = '1';
    sheet.getCell(3, 1).value = '2';
    sheet.getCell(3, 2).value = 'CIF';
    const rows = readSheetRows(wb, layout.sheets[0], 10);
    expect(rows.map((r) => r.row)).toEqual([3]);
    expect(rows[0].values.code).toBe('CIF');
  });

  it('a file with an old or reordered header is rejected as a whole', async () => {
    const wb = await loadBook(await buildImportTemplate({ layout: CONSUMER_IMPORT_LAYOUT }));
    wb.worksheets[0].getCell(1, 2).value = 'Mã app';
    wb.worksheets[0].getCell(2, 2).value = 'APP_X';
    const file = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(loadImportWorkbook(file, CONSUMER_IMPORT_LAYOUT)).rejects.toThrow(
      /INVALID_TEMPLATE.*Mã định danh App/,
    );
  });

  it('example templates number the STT column and fill every required column', async () => {
    const ds = {
      query: jest.fn((sql: string) => {
        if (sql.includes('data_hub_request_units')) return [{ code: 'AF' }];
        if (sql.includes('data_hub_divisions')) return [{ code: 'EDA' }];
        if (sql.includes('data_hub_departments')) return [{ code: 'C360' }];
        if (sql.includes('data_hub_consumers')) return [{ code: 'APP_CRM' }];
        if (sql.includes('data_hub_owner_units')) return [{ code: 'Khối Vận hành' }];
        if (sql.includes('data_hub_systems')) return [{ code: 'OCP' }];
        if (sql.includes('data_hub_data_services')) return [{ code: 'API_X' }];
        if (sql.includes('data_hub_logical_terms')) return [{ code: 'DOB' }, { code: 'CIF' }];
        return [];
      }),
    };
    const email = { email: 'so@vpbank.com.vn' };
    const files: Array<[ImportLayout, Buffer]> = [
      [CONSUMER_IMPORT_LAYOUT, await new ConsumerImportTemplateService(ds as never).build(email)],
      [LOGICAL_TERM_IMPORT_LAYOUT, await new LogicalTermImportTemplateService().build(true)],
      [SERVICE_IMPORT_LAYOUTS.API, await new DataServiceImportTemplateService(ds as never).build('API', email)],
      [SERVICE_IMPORT_LAYOUTS.SFTP, await new DataServiceImportTemplateService(ds as never).build('SFTP', email)],
      [SOURCE_TABLE_IMPORT_LAYOUT, await new SourceTableImportTemplateService(ds as never).build(true)],
    ];
    for (const [layout, file] of files) {
      const { sheets } = await loadImportWorkbook(file, layout);
      const def = layout.sheets[0];
      const rows = sheets[def.key];
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        for (const c of def.columns.filter((x) => x.level === 'r')) {
          expect({ sheet: def.name, row: r.row, column: c.header, filled: r.values[c.key] !== '' }).toMatchObject({
            filled: true,
          });
        }
      }
      if (def.columns[0].key === 'stt') {
        const wb = await loadBook(file);
        expect(cellText(wb.worksheets[0].getCell(2, 1).value)).toBe('1');
      }
    }
  });

  it('enum columns carry an in-cell dropdown', () => {
    const method = SERVICE_IMPORT_LAYOUTS.API.sheets[0].columns.find((c) => c.key === 'method');
    expect(method?.options).toContain('GET');
  });
});

describe('import routes', () => {
  type Ctor = { prototype: Record<string, unknown> };
  const CASES: Array<[string, Ctor, string, string]> = [
    ['consumers', ConsumerImportController as never, 'template', 'import'],
    ['logical terms', LogicalTermImportController as never, 'template', 'import'],
    ['API services', DataServiceImportController as never, 'apiTemplate', 'importApi'],
    ['SFTP services', DataServiceImportController as never, 'sftpTemplate', 'importSftp'],
    ['source tables', SourceTableImportController as never, 'template', 'import'],
  ];

  describe.each(CASES)('%s', (_n, ctrl, template, upload) => {
    it('the controller is for super_admin only', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, ctrl)).toEqual([BearerGuard, IsSuperAdminGuard]);
    });

    it.each([
      [template, RequestMethod.GET],
      [upload, RequestMethod.POST],
    ])('%s needs no role permission code on top', (handler, method) => {
      const fn = ctrl.prototype[handler] as object;
      expect(Reflect.getMetadata(METHOD_METADATA, fn)).toBe(method);
      expect(Reflect.getMetadata(PERMISSION_META_KEY, fn)).toBeUndefined();
    });
  });
});

describe('IsSuperAdminGuard', () => {
  const run = (type?: string) =>
    new IsSuperAdminGuard().canActivate({
      switchToHttp: () => ({ getRequest: () => ({ info: { user: { id: 1, type } } }) }),
    } as never);

  it('lets super_admin through and refuses everyone else', () => {
    expect(run('super_admin')).toBe(true);
    expect(() => run('user')).toThrow(ForbiddenException);
    expect(() => run(undefined)).toThrow(ForbiddenException);
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
