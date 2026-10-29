import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { assertSafeWorkbook } from './data-service-import-file-guard.util';
import {
  IMPORT_LIMITS,
  IMPORT_SHEETS,
  ImportColumn,
  ImportDataSheet,
  SHEET_COLUMNS,
} from './data-service-import-sheet-columns';

// One problem found in the upload, pinned to a cell (or a whole row when `column` is absent).
export interface ImportIssue {
  sheet: ImportDataSheet;
  row: number;
  column?: string;
  code: string;
  message: string;
}

// A data row of one sheet: trimmed text per column key ('' = empty cell).
export interface ImportRow {
  row: number;
  values: Record<string, string>;
}

export type ImportSheetRows = Record<ImportDataSheet, ImportRow[]>;

// Excel column letter of a 0-based column index (A, B, ..., Z, AA).
export const columnLetter = (index: number): string => {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

const pad = (n: number): string => String(n).padStart(2, '0');

// Text of a cell whatever Excel stored: rich text, hyperlinks (emails typed in Excel become mailto links),
// formula results, dates (written back as YYYY-MM-DD so an example date stays readable) and numbers.
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const d = value;
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const hasTime = d.getUTCHours() + d.getUTCMinutes() + d.getUTCSeconds() > 0;
    return hasTime ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` : date;
  }
  if (typeof value === 'object') {
    if ('richText' in value)
      return value.richText
        .map((t) => t.text)
        .join('')
        .trim();
    if ('formula' in value || 'sharedFormula' in value)
      return cellText((value as ExcelJS.CellFormulaValue).result ?? '');
    // The link text may itself be rich text (an email pasted with formatting).
    if ('hyperlink' in value) return cellText(value.text as ExcelJS.CellValue);
    if ('error' in value) return '';
    return '';
  }
  return String(value).trim();
}

// Header labels are compared loosely (Unicode form, case, spaces, the trailing required mark).
const normalizeHeader = (text: string): string =>
  text.normalize('NFC').replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

const DATA_SHEETS: ImportDataSheet[] = ['API', 'SFTP', 'TERMS', 'LOGICAL'];

// Every data sheet must exist with the template's header row; anything else is a wrong file, rejected as a whole.
export function assertTemplateLayout(workbook: ExcelJS.Workbook): void {
  const problems: string[] = [];
  for (const key of DATA_SHEETS) {
    const name = IMPORT_SHEETS[key];
    const sheet = workbook.getWorksheet(name);
    if (!sheet) {
      problems.push(`thiếu sheet ${name}`);
      continue;
    }
    const header = sheet.getRow(1);
    SHEET_COLUMNS[key].forEach((c: ImportColumn, i) => {
      const got = cellText(header.getCell(i + 1).value);
      if (normalizeHeader(got) !== normalizeHeader(c.header)) {
        problems.push(`${name}!${columnLetter(i)}1 phải là "${c.header}" (đang là "${got}")`);
      }
    });
  }
  if (problems.length > 0) {
    throw new BadRequestException(
      `INVALID_TEMPLATE: file không đúng template import: ${problems.slice(0, 10).join('; ')}`,
    );
  }
}

const TOO_MANY = new Error('TOO_MANY_ROWS');

// Non-empty data rows (from row 2) of one sheet, at most `limit`. Only rows stored in the file are visited:
// `rowCount` is the highest row index, which one formatted cell at row 1048576 turns into a million-row loop.
export function readSheetRows(workbook: ExcelJS.Workbook, key: ImportDataSheet, limit: number): ImportRow[] {
  const sheet = workbook.getWorksheet(IMPORT_SHEETS[key]);
  if (!sheet) return [];
  const columns = SHEET_COLUMNS[key];
  const rows: ImportRow[] = [];
  try {
    sheet.eachRow({ includeEmpty: false }, (row, r) => {
      if (r < 2) return;
      const values: Record<string, string> = {};
      let empty = true;
      columns.forEach((c, i) => {
        const text = cellText(row.getCell(i + 1).value);
        values[c.key] = text;
        if (text !== '') empty = false;
      });
      if (empty) return;
      if (rows.length >= limit) throw TOO_MANY;
      rows.push({ row: r, values });
    });
  } catch (err) {
    if (err !== TOO_MANY) throw err;
    throw new BadRequestException(`TOO_MANY_ROWS: sheet ${IMPORT_SHEETS[key]} tối đa ${limit} dòng`);
  }
  return rows;
}

// Checks the raw file, parses it and reads every data sheet within the size caps; any failure is a 400 for the
// whole file.
export async function loadImportWorkbook(
  file: Buffer,
): Promise<{ workbook: ExcelJS.Workbook; sheets: ImportSheetRows }> {
  await assertSafeWorkbook(file);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException('INVALID_FILE: không đọc được file .xlsx');
  }
  assertTemplateLayout(workbook);
  let sheets: ImportSheetRows;
  try {
    sheets = {
      API: readSheetRows(workbook, 'API', IMPORT_LIMITS.SERVICES),
      SFTP: readSheetRows(workbook, 'SFTP', IMPORT_LIMITS.SERVICES),
      TERMS: readSheetRows(workbook, 'TERMS', IMPORT_LIMITS.TERM_ROWS),
      LOGICAL: readSheetRows(workbook, 'LOGICAL', IMPORT_LIMITS.LOGICAL_ROWS),
    };
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    throw new BadRequestException('INVALID_FILE: có ô không đọc được');
  }
  const services = sheets.API.length + sheets.SFTP.length;
  if (services === 0) throw new BadRequestException('EMPTY_FILE: chưa có dịch vụ nào');
  if (services > IMPORT_LIMITS.SERVICES) {
    throw new BadRequestException(`TOO_MANY_ROWS: tối đa ${IMPORT_LIMITS.SERVICES} dịch vụ mỗi file`);
  }
  return { workbook, sheets };
}
// Letter of a column key on a sheet, for pinning an issue to a cell.
export const letterOf = (sheet: ImportDataSheet, key: string): string | undefined => {
  const i = SHEET_COLUMNS[sheet].findIndex((c) => c.key === key);
  return i < 0 ? undefined : columnLetter(i);
};

// Splits a multi-value cell (app codes, emails) on ; , or new lines.
export const splitList = (text: string): string[] =>
  text
    .split(/[;,\n]/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
