// Shared machinery of the five Data Hub bulk imports: the layout model, the workbook reader with its file guard,
// the per-cell issue collector, the annotated result workbook and the template builder.
import { BadRequestException } from '@nestjs/common';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import * as dayjs from 'dayjs';
import * as ExcelJS from 'exceljs';

// Layout model shared by every Data Hub bulk import. The template builder and the parser both read the same
// layout, so a column added to a layout appears in the downloaded template and is read back from the upload in
// the same position.

// Every import file has exactly one data sheet. Sheet names are ASCII, upper case, no spaces, so they survive any
// Excel locale and are matched exactly.

// r = required, c = required depending on another column, o = optional.
export type ImportColumnLevel = 'r' | 'c' | 'o';

export interface ImportColumn {
  key: string;
  header: string;
  level: ImportColumnLevel;
  width: number;
  note: string;
  // Fixed values of an enum column, shown as an in-cell dropdown (inline list, no helper sheet).
  options?: string[];
}

export const col = (
  key: string,
  header: string,
  level: ImportColumnLevel,
  width: number,
  note: string,
  options?: string[],
): ImportColumn => ({ key, header, level, width, note, options });

export interface ImportSheetDef {
  // Key used in rows, issues and results; the sheet name is what the user sees.
  key: string;
  name: string;
  columns: ImportColumn[];
  // Most data rows read from this sheet.
  maxRows: number;
  // Rows of the template that get dropdowns.
  templateRows?: number;
}

export interface ImportLayout {
  sheets: ImportSheetDef[];
  // Sheets whose rows are the unit of the import: a file without any is empty, and together they are capped.
  primarySheets: string[];
  maxPrimaryRows: number;
  // Wording of the whole-file errors.
  emptyMessage: string;
  tooManyMessage: string;
  // Prefix of the result file name, e.g. ket-qua-import-dich-vu.
  resultFilePrefix: string;
}

export const sheetDef = (layout: ImportLayout, key: string): ImportSheetDef => {
  const def = layout.sheets.find((s) => s.key === key);
  if (!def) throw new Error(`Unknown import sheet ${key}`);
  return def;
};

// Header text as written in the template: required columns end with " *".
export const headerText = (c: ImportColumn): string => (c.level === 'r' ? `${c.header} *` : c.header);

export const IMPORT_FILE_BYTES = 5 * 1024 * 1024;
// Rows of the template that get formatting and dropdowns unless a sheet says otherwise.
export const DEFAULT_TEMPLATE_ROWS = 1000;

// One problem found in the upload, pinned to a cell (or a whole row when `column` is absent).
export interface ImportIssue {
  sheet: string;
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

// Rows of every data sheet of a layout, by sheet key.
export type ImportSheetRows = Record<string, ImportRow[]>;

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

// Every data sheet must exist with the template's header row; anything else is a wrong file, rejected as a whole.
export function assertTemplateLayout(workbook: ExcelJS.Workbook, layout: ImportLayout): void {
  const problems: string[] = [];
  for (const { name, columns } of layout.sheets) {
    const sheet = workbook.getWorksheet(name);
    if (!sheet) {
      problems.push(`thiếu sheet ${name}`);
      continue;
    }
    const header = sheet.getRow(1);
    columns.forEach((c, i) => {
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
export function readSheetRows(workbook: ExcelJS.Workbook, def: ImportSheetDef, limit: number): ImportRow[] {
  const sheet = workbook.getWorksheet(def.name);
  if (!sheet) return [];
  const columns = def.columns;
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
    throw new BadRequestException(`TOO_MANY_ROWS: sheet ${def.name} tối đa ${limit} dòng`);
  }
  return rows;
}

// Parses the file and reads every data sheet of the layout within the row caps; any failure is a 400 for the whole file.
export async function loadImportWorkbook(
  file: Buffer,
  layout: ImportLayout,
): Promise<{ workbook: ExcelJS.Workbook; sheets: ImportSheetRows }> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException('INVALID_FILE: không đọc được file .xlsx');
  }
  assertTemplateLayout(workbook, layout);
  const sheets: ImportSheetRows = {};
  try {
    for (const def of layout.sheets) sheets[def.key] = readSheetRows(workbook, def, def.maxRows);
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    throw new BadRequestException('INVALID_FILE: có ô không đọc được');
  }
  const primary = layout.primarySheets.reduce((sum, key) => sum + sheets[key].length, 0);
  if (primary === 0) throw new BadRequestException(`EMPTY_FILE: ${layout.emptyMessage}`);
  if (primary > layout.maxPrimaryRows) {
    throw new BadRequestException(`TOO_MANY_ROWS: ${layout.tooManyMessage} (tối đa ${layout.maxPrimaryRows})`);
  }
  return { workbook, sheets };
}

// Letter of a column key on a sheet, for pinning an issue to a cell.
export const letterOf = (layout: ImportLayout, sheet: string, key: string): string | undefined => {
  const i = sheetDef(layout, sheet).columns.findIndex((c) => c.key === key);
  return i < 0 ? undefined : columnLetter(i);
};

// Splits a multi-value cell (app codes, emails) on ; , or new lines.
export const splitList = (text: string): string[] =>
  text
    .split(/[;,\n]/)
    .map((s) => s.trim())
    .filter((s) => s !== '');

export interface ImportIssueWithLevel extends ImportIssue {
  // Warnings are reported but do not stop the row.
  warning?: boolean;
}

// Where a DTO property path lands in the workbook; undefined = report on the row itself.
export type IssueLocator = (path: string) => { sheet: string; row: number; key?: string } | undefined;

// Collects issues, one entry per cell: several problems on the same cell are joined into that entry. The DTO pass
// runs last with `onlyIfFree`, so a cell already reported (e.g. empty required, unknown code) is not reported again
// as "must be an enum value".
export class ImportIssueCollector {
  readonly issues: ImportIssueWithLevel[] = [];
  private readonly cells = new Map<string, ImportIssueWithLevel>();
  private readonly rowsWithErrors = new Set<string>();

  constructor(private readonly layout: ImportLayout) {}

  add(
    sheet: string,
    row: number,
    key: string | undefined,
    code: string,
    message: string,
    warning = false,
    onlyIfFree = false,
  ) {
    const column = key ? letterOf(this.layout, sheet, key) : undefined;
    const cell = `${sheet}!${row}!${column ?? '*'}!${warning ? 'w' : 'e'}`;
    const existing = this.cells.get(cell);
    if (existing) {
      if (onlyIfFree) return;
      if (!existing.code.split(', ').includes(code)) existing.code = `${existing.code}, ${code}`;
      if (!existing.message.includes(message)) existing.message = `${existing.message}; ${message}`;
      return;
    }
    const issue: ImportIssueWithLevel = { sheet, row, column, code, message, ...(warning ? { warning: true } : {}) };
    this.cells.set(cell, issue);
    this.issues.push(issue);
    if (!warning) this.rowsWithErrors.add(`${sheet}!${row}`);
  }

  hasError(sheet: string, row: number): boolean {
    return this.rowsWithErrors.has(`${sheet}!${row}`);
  }
}

const numberIn = (text: string): string => /(\d+)/.exec(text)?.[1] ?? '';

// Vietnamese code + message for a class-validator failure.
function describe(constraint: string, message: string): { code: string; message: string } {
  switch (constraint) {
    case 'isNotEmpty':
    case 'isDefined':
      return {
        code: 'REQUIRED',
        message: /SYNC/.test(message) ? 'Bắt buộc khi Chế độ đồng bộ = SYNC' : 'Không được để trống',
      };
    case 'maxLength':
      return { code: 'TOO_LONG', message: `Tối đa ${numberIn(message)} ký tự` };
    case 'isEnum':
      return { code: 'INVALID_VALUE', message: 'Giá trị không có trong danh sách (DANH_MUC)' };
    case 'arrayMinSize':
      return { code: 'INVALID_COUNT', message: `Cần ít nhất ${numberIn(message)} giá trị` };
    case 'arrayMaxSize':
      return { code: 'INVALID_COUNT', message: `Tối đa ${numberIn(message)} giá trị` };
    case 'arrayUnique':
      return { code: 'DUPLICATE_VALUE', message: 'Có giá trị bị lặp' };
    case 'isInt':
    case 'min':
    case 'max':
      return { code: 'INVALID_NUMBER', message: 'Số không hợp lệ' };
    case 'isBoolean':
      return { code: 'INVALID_VALUE', message: 'Chỉ nhận Có hoặc Không' };
    default:
      return { code: 'INVALID', message };
  }
}

const RANK = ['isDefined', 'isNotEmpty', 'isEnum', 'isString', 'isInt', 'isBoolean'];
const rank = (constraint: string): number => {
  const i = RANK.indexOf(constraint);
  return i < 0 ? RANK.length : i;
};

function flatten(errors: ValidationError[], prefix = ''): Array<{ path: string; constraint: string; message: string }> {
  return errors.flatMap((e) => {
    const path = prefix ? `${prefix}.${e.property}` : e.property;
    const own = Object.entries(e.constraints ?? {}).map(([constraint, message]) => ({ path, constraint, message }));
    return [...own, ...flatten(e.children ?? [], path)];
  });
}

// Runs the API's own DTO class on the plain object built from the workbook (the same transforms and rules as the
// ValidationPipe), records each failure on its cell and returns the transformed instance.
export async function validateDto<T extends object>(
  cls: ClassConstructor<T>,
  plain: Record<string, unknown>,
  issues: ImportIssueCollector,
  locate: IssueLocator,
): Promise<T> {
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  // One failure per property: "required" first, so an empty cell is not reported as "too long" or "not a string".
  const byPath = new Map<string, { constraint: string; message: string }>();
  for (const f of flatten(errors)) {
    const current = byPath.get(f.path);
    if (!current || rank(f.constraint) < rank(current.constraint)) byPath.set(f.path, f);
  }
  for (const [path, f] of byPath) {
    const at = locate(path);
    if (!at) continue;
    const d = describe(f.constraint, f.message);
    issues.add(at.sheet, at.row, at.key, d.code, d.message, false, true);
  }
  return instance;
}

// created = written (or updated), valid = passed a dry run, skipped = left alone on purpose.
export type RowOutcome = 'created' | 'valid' | 'failed' | 'skipped';

export interface RowResult {
  outcome: RowOutcome;
  // Shown after the status, e.g. the created service code.
  note?: string;
}

const LABEL: Record<RowOutcome, string> = {
  created: 'Thành công',
  valid: 'Hợp lệ',
  failed: 'Lỗi',
  skipped: 'Bỏ qua',
};

const FILL: Record<RowOutcome, string> = {
  created: 'FFD9F2E3',
  valid: 'FFD9F2E3',
  failed: 'FFFBDADA',
  skipped: 'FFFFF1CC',
};

// Writes "Kết quả" and "Chi tiết" columns after the template columns of every data sheet of the uploaded workbook,
// so the user fixes the rows in the same file and uploads it again (the two extra columns are ignored on read).
export async function buildResultWorkbook(
  layout: ImportLayout,
  workbook: ExcelJS.Workbook,
  results: Map<string, RowResult>,
  issues: ImportIssueWithLevel[],
): Promise<Buffer> {
  const issuesByRow = new Map<string, Map<number, ImportIssueWithLevel[]>>();
  for (const i of issues) {
    const bySheet = issuesByRow.get(i.sheet) ?? new Map<number, ImportIssueWithLevel[]>();
    bySheet.set(i.row, [...(bySheet.get(i.row) ?? []), i]);
    issuesByRow.set(i.sheet, bySheet);
  }
  for (const { key, name, columns } of layout.sheets) {
    const sheet = workbook.getWorksheet(name);
    if (!sheet) continue;
    const statusCol = columns.length + 1;
    const detailCol = statusCol + 1;
    const header = sheet.getRow(1);
    header.getCell(statusCol).value = 'Kết quả';
    header.getCell(detailCol).value = 'Chi tiết';
    header.getCell(statusCol).font = { bold: true };
    header.getCell(detailCol).font = { bold: true };
    sheet.getColumn(statusCol).width = 14;
    sheet.getColumn(detailCol).width = 70;

    // Old results (a result file uploaded again) are cleared first; only rows stored in the file are visited.
    sheet.eachRow({ includeEmpty: false }, (row, r) => {
      if (r < 2) return;
      row.getCell(statusCol).value = null;
      row.getCell(detailCol).value = null;
    });
    const rows = new Set<number>([
      ...[...results.keys()].filter((k) => k.startsWith(`${key}!`)).map((k) => Number(k.split('!')[1])),
      ...(issuesByRow.get(key)?.keys() ?? []),
    ]);
    for (const r of rows) {
      const result = results.get(`${key}!${r}`);
      const rowIssues = issuesByRow.get(key)?.get(r) ?? [];
      const outcome = result?.outcome ?? 'failed';
      const details = [
        ...(result?.note ? [result.note] : []),
        ...rowIssues.map(
          (i) => `${i.warning ? '[Cảnh báo] ' : ''}${i.column ? `${i.column}${r}: ` : ''}${i.code} - ${i.message}`,
        ),
      ];
      const row = sheet.getRow(r);
      const status = row.getCell(statusCol);
      status.value = LABEL[outcome];
      status.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[outcome] } };
      const detail = row.getCell(detailCol);
      detail.value = details.join('\n');
      detail.alignment = { wrapText: true, vertical: 'top' };
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// Result file of a run: the annotated workbook as a named base64 attachment.
export async function buildResultFile(
  layout: ImportLayout,
  workbook: ExcelJS.Workbook,
  results: Map<string, RowResult>,
  issues: ImportIssueWithLevel[],
): Promise<{ file_name: string; content_base64: string }> {
  const buffer = await buildResultWorkbook(layout, workbook, results, issues);
  return {
    file_name: `${layout.resultFilePrefix}_${dayjs().format('DD-MM-YYYY_HHmm')}.xlsx`,
    content_base64: buffer.toString('base64'),
  };
}

type RangeValidations = { dataValidations: { add(address: string, rule: ExcelJS.DataValidation): void } };

const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFDCEFE8' } };
const REQUIRED_FONT = { bold: true, color: { argb: 'FFB4232C' } };

export interface TemplateSpec {
  layout: ImportLayout;
  // Writes sample rows into the data sheet (example download).
  fillExample?: (workbook: ExcelJS.Workbook) => void;
}

// Builds an import template: the layout's single data sheet (text-formatted cells, dropdowns for enum columns, a
// help note on every header).
export async function buildImportTemplate(spec: TemplateSpec): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Data Hub';
  spec.layout.sheets.forEach((def) => addDataSheet(workbook, def));
  spec.fillExample?.(workbook);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// Values are written as text, the same way a user types into the text-formatted cells.
export function writeExampleRows(workbook: ExcelJS.Workbook, def: ImportSheetDef, rows: Array<Record<string, string>>) {
  const sheet = workbook.getWorksheet(def.name);
  if (!sheet) return;
  rows.forEach((values, i) => {
    def.columns.forEach((c, j) => {
      const v = values[c.key];
      if (v) sheet.getCell(i + 2, j + 1).value = v;
    });
  });
}

function addDataSheet(workbook: ExcelJS.Workbook, def: ImportSheetDef): void {
  const sheet = workbook.addWorksheet(def.name, { views: [{ state: 'frozen', ySplit: 1 }] });
  const last = (def.templateRows ?? DEFAULT_TEMPLATE_ROWS) + 1;
  def.columns.forEach((c, i) => {
    const column = sheet.getColumn(i + 1);
    column.width = c.width;
    // Text format keeps what is typed as typed: leading zeros, dates, long numbers.
    column.numFmt = '@';
    const cell = sheet.getCell(1, i + 1);
    cell.value = headerText(c);
    cell.fill = HEADER_FILL;
    cell.font = c.level === 'r' ? REQUIRED_FONT : { bold: true };
    cell.alignment = { wrapText: true, vertical: 'middle' };
    cell.note = `${c.level === 'r' ? 'Bắt buộc. ' : c.level === 'c' ? 'Có điều kiện. ' : 'Tuỳ chọn. '}${c.note}`;
    if (c.options?.length) {
      const letter = columnLetter(i);
      // One rule for the whole column range (exceljs supports it; its typings only declare per-cell rules).
      (sheet as unknown as RangeValidations).dataValidations.add(`${letter}2:${letter}${last}`, {
        type: 'list',
        allowBlank: true,
        formulae: [`"${c.options.join(',')}"`],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Giá trị không hợp lệ',
        error: `Chọn một trong: ${c.options.join(', ')}`,
      });
    }
  });
  sheet.getRow(1).height = 32;
}

// yyMMddHHmmssSSS: two downloads in the same minute must not share generated codes or names.
export const exampleTag = (): string => new Date().toISOString().replace(/\D/g, '').slice(2, 17);
