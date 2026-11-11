import * as ExcelJS from 'exceljs';
import * as dayjs from 'dayjs';
import { Response } from 'express';

export interface ExcelColumn {
  header: string; // Display label in Excel header row
  key: string; // Key to extract from row data
  width?: number; // Column width (default 20)
}

// Text a spreadsheet app could read as a formula (= + - @) or that starts with a tab / carriage return gets a
// leading apostrophe, so user-written text is always shown as text (CSV / formula injection).
const FORMULA_START = /^[=+\-@\t\r]/;
export const safeExcelText = (value: string): string => (FORMULA_START.test(value) ? `'${value}` : value);

// String values of a row made safe; numbers, dates, booleans and nulls are kept as they are.
export function sanitizeRow<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) out[key] = typeof value === 'string' ? safeExcelText(value) : value;
  return out as T;
}

export interface ExportExcelOptions {
  sheetName: string;
  columns: ExcelColumn[];
  rows: Record<string, any>[];
}

export interface ExportExcelSheet {
  sheetName: string;
  columns: ExcelColumn[];
  rows: Record<string, any>[];
}

// Generate Excel workbook and stream to HTTP response. Every string cell goes through safeExcelText, so no caller
// can write user text that would run as a formula.
// Shared utility — usable by any module needing Excel export.
export function exportExcelToResponse(res: Response, options: ExportExcelOptions): Promise<void> {
  return exportExcelSheetsToResponse(res, options.sheetName, [options]);
}

// Several sheets in one workbook; `fileBase` names the download (date appended).
export async function exportExcelSheetsToResponse(
  res: Response,
  fileBase: string,
  sheets: ExportExcelSheet[],
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  for (const { sheetName, columns, rows } of sheets) {
    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width || 20,
    }));
    // Bold header row
    sheet.getRow(1).font = { bold: true };
    rows.forEach((row) => sheet.addRow(sanitizeRow(row)));
  }

  const safeName = fileBase.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${safeName}_${dayjs().format('DD-MM-YYYY_HHmm')}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  try {
    await workbook.xlsx.write(res);
    res.end();
  } catch {
    if (!res.headersSent) res.status(500).json({ message: 'Excel generation failed' });
  }
}
