// Shared helpers of the import specs: workbook editing by column key and a stubbed access service.
import * as ExcelJS from 'exceljs';
import { ImportLayout, sheetDef } from '../import-workbook.util';

export async function loadBook(file: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as unknown as ArrayBuffer);
  return wb;
}

// 1-based column of a layout key, so specs do not depend on column letters.
export const colOf = (layout: ImportLayout, key: string, sheetKey = layout.primarySheets[0]): number => {
  const i = sheetDef(layout, sheetKey).columns.findIndex((c) => c.key === key);
  if (i < 0) throw new Error(`no column ${key}`);
  return i + 1;
};

// Letter of a layout key as issues report it (A, B, ...).
export const letterOfKey = (layout: ImportLayout, key: string): string => String.fromCharCode(64 + colOf(layout, key));

export async function editSheet(
  file: Buffer,
  layout: ImportLayout,
  change: (sheet: ExcelJS.Worksheet, col: (key: string) => number) => void,
): Promise<Buffer> {
  const wb = await loadBook(file);
  change(wb.getWorksheet(sheetDef(layout, layout.primarySheets[0]).name), (key) => colOf(layout, key));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Access service granting exactly the given permission codes.
export const accessWith = (...codes: string[]) => ({
  hasCode: jest.fn((_caller: unknown, code: string) => Promise.resolve(codes.includes(code))),
});

export const CALLER = { id: 1, type: 'user', client: 'user' };
