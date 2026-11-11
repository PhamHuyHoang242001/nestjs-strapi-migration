import { PassThrough } from 'stream';
import * as ExcelJS from 'exceljs';
import { exportExcelSheetsToResponse } from '@common/utils/export-excel.helper';
import { DataHubUserRefService } from '../../common/data-hub-user-ref.service';
import { DataHubConsumerExportService } from '../../consumer/data-hub-consumer-export.service';
import { LogicalTermExportService } from '../../dictionary/logical-term-export.service';
import { CONSUMER_IMPORT_LAYOUT, LOGICAL_TERM_IMPORT_LAYOUT } from '../import-layouts';
import { cellText, loadImportWorkbook } from '../import-workbook.util';
import { layoutSheet } from '../layout-export.util';

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

describe('App thụ hưởng export', () => {
  const query = jest.fn((sql: string) => {
    if (sql.includes('FROM data_hub_consumers c')) {
      return [
        {
          id: 5,
          code: 'APP_CRM',
          name: 'CRM',
          category: 'INTERNAL_APP',
          short_description: '+ mô tả',
          system_name: 'OCP',
          system_service: null,
          owner_unit_name: 'Khối Vận hành',
        },
      ];
    }
    if (sql.includes('FROM data_hub_consumer_so_apps')) {
      return [
        { consumer_id: 5, user_id: 7 },
        { consumer_id: 5, user_id: 8 },
      ];
    }
    if (sql.includes('FROM users WHERE')) {
      return [
        { id: 7, email: 'so1@vpbank.com.vn' },
        { id: 8, email: 'so2@vpbank.com.vn' },
      ];
    }
    return [];
  });
  const dataSource = { query, manager: { query } };
  const service = new DataHubConsumerExportService(dataSource as never, new DataHubUserRefService(dataSource as never));

  it('rows carry the template columns with names and SO App emails as the import reads them', async () => {
    expect(await service.buildRows({})).toEqual([
      {
        code: 'APP_CRM',
        name: 'CRM',
        system: 'OCP',
        system_service: '',
        category: 'INTERNAL_APP',
        owner_unit: 'Khối Vận hành',
        so_apps: 'so1@vpbank.com.vn; so2@vpbank.com.vn',
        short_description: '+ mô tả',
      },
    ]);
  });

  it('the file has the template sheet and exact headers, and imports back as is', async () => {
    const { book, file } = await written((res) => service.export({}, res));
    expect(book.worksheets.map((w) => w.name)).toEqual(['APP_THU_HUONG']);
    expect(headersOf(book.worksheets[0])).toEqual([
      'STT',
      'Mã định danh App',
      'Tên App thụ hưởng',
      'Hệ thống',
      'Dịch vụ hệ thống',
      'Phân loại',
      'Đơn vị chủ quản',
      'SO App',
      'Mô tả ngắn (VI)',
    ]);
    const { sheets } = await loadImportWorkbook(file, CONSUMER_IMPORT_LAYOUT);
    expect(sheets.CONSUMERS[0].values).toMatchObject({ stt: '1', code: 'APP_CRM', short_description: '+ mô tả' });
  });
});

describe('Thuật ngữ chuẩn hoá export', () => {
  it('one row per term with exactly STT, Thuật ngữ Chuẩn hoá (Logical Term), Mô tả, Ví dụ', async () => {
    const calls: string[] = [];
    const dataSource = {
      query: jest.fn((sql: string) => {
        calls.push(sql);
        return [
          { code: 'cif', short_description: 'Số CIF', example_value: '001' },
          { code: 'dob', short_description: 'Ngày sinh', example_value: null },
        ];
      }),
    };
    const rows = await new LogicalTermExportService(dataSource as never).buildRows({} as never);
    expect(rows).toEqual([
      { code: 'cif', short_description: 'Số CIF', example_value: '001' },
      { code: 'dob', short_description: 'Ngày sinh', example_value: '' },
    ]);
    expect(calls[0]).toContain('lt.deleted_at IS NULL AND lt.is_deleted IS NOT TRUE');
    expect(calls[0]).not.toContain('data_hub_physical_terms p\n');

    const { book, file } = await written((res) =>
      exportExcelSheetsToResponse(res, 'thuat-ngu-chuan-hoa', [layoutSheet(LOGICAL_TERM_IMPORT_LAYOUT, rows)]),
    );
    expect(book.worksheets[0].name).toBe('THUAT_NGU_CHUAN_HOA');
    expect(headersOf(book.worksheets[0])).toEqual(['STT', 'Thuật ngữ Chuẩn hoá (Logical Term)', 'Mô tả', 'Ví dụ']);
    const { sheets } = await loadImportWorkbook(file, LOGICAL_TERM_IMPORT_LAYOUT);
    expect(sheets.TERMS.map((r) => r.values.code)).toEqual(['cif', 'dob']);
  });
});
