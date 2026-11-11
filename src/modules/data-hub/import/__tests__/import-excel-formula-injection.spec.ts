import { PassThrough } from 'stream';
import * as ExcelJS from 'exceljs';
import { exportExcelToResponse, safeExcelText, sanitizeRow } from '@common/utils/export-excel.helper';
import { LOGICAL_TERM_IMPORT_LAYOUT as LAYOUT } from '../import-layouts';
import { buildImportTemplate, buildResultWorkbook, cellText, readSheetRows } from '../import-workbook.util';
import { colOf, loadBook } from './import-test-helpers';

describe('safeExcelText / sanitizeRow', () => {
  it('prefixes text a spreadsheet would read as a formula; other text is unchanged', () => {
    for (const v of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx']) expect(safeExcelText(v)).toBe(`'${v}`);
    for (const v of ['plain', 'a=b', '', "'=already"]) expect(safeExcelText(v)).toBe(v);
  });

  it('only string values of a row change', () => {
    const date = new Date(0);
    expect(sanitizeRow({ a: '=x', n: -5, d: date, b: true, z: null })).toEqual({
      a: "'=x",
      n: -5,
      d: date,
      b: true,
      z: null,
    });
  });
});

describe('exportExcelToResponse', () => {
  it('every caller gets formula-like text written as text', async () => {
    const out = new PassThrough();
    const chunks: Buffer[] = [];
    out.on('data', (c: Buffer) => chunks.push(c));
    const res = Object.assign(out, { setHeader: jest.fn(), headersSent: false, status: jest.fn() });
    await exportExcelToResponse(res as never, {
      sheetName: 'consumers',
      columns: [
        { header: 'Tên', key: 'name' },
        { header: 'Số', key: 'n' },
      ],
      rows: [{ name: '=HYPERLINK("http://evil","x")', n: 3 }],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.concat(chunks) as unknown as ArrayBuffer);
    expect(wb.worksheets[0].getCell('A2').value).toBe('\'=HYPERLINK("http://evil","x")');
    expect(wb.worksheets[0].getCell('B2').value).toBe(3);
  });
});

describe('import result file', () => {
  it('uploaded formulas, links and formula-like text come back inert, and re-import to the same values', async () => {
    const wb = await loadBook(await buildImportTemplate({ layout: LAYOUT }));
    const sheet = wb.worksheets[0];
    const code = colOf(LAYOUT, 'code');
    const desc = colOf(LAYOUT, 'short_description');
    const example = colOf(LAYOUT, 'example_value');
    sheet.getCell(2, code).value = 'CIF';
    sheet.getCell(2, desc).value = { formula: 'HYPERLINK("http://evil","Mở")', result: 'Mở' };
    sheet.getCell(2, example).value = '=1+2';
    sheet.getCell(3, code).value = 'DOB';
    sheet.getCell(3, desc).value = { text: 'a@b.vn', hyperlink: 'mailto:a@b.vn' };
    sheet.getCell(3, example).value = '-5 ngày';

    const before = readSheetRows(wb, LAYOUT.sheets[0], 10).map((r) => r.values);
    const out = await loadBook(await buildResultWorkbook(LAYOUT, wb, new Map(), []));
    const res = out.worksheets[0];
    expect(res.getCell(2, desc).value).toBe('Mở');
    expect(res.getCell(2, example).value).toBe("'=1+2");
    expect(res.getCell(3, desc).value).toBe('a@b.vn');
    expect(res.getCell(3, example).value).toBe("'-5 ngày");
    // No formula and no link survives anywhere in the data rows.
    res.eachRow((row) => row.eachCell((c) => expect(typeof c.value === 'object' && c.value !== null).toBe(false)));
    // Uploading the result file again reads the original values (the guard apostrophe is dropped).
    expect(readSheetRows(out, LAYOUT.sheets[0], 10).map((r) => r.values)).toEqual(before);
    expect(cellText("'=1+2")).toBe('=1+2');
    expect(cellText("'plain")).toBe("'plain");
  });
});
