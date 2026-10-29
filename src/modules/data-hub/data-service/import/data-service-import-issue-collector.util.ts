import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { ImportDataSheet } from './data-service-import-sheet-columns';
import { ImportIssue, letterOf } from './data-service-import-workbook-reader.util';

export interface ImportIssueWithLevel extends ImportIssue {
  // Warnings are reported but do not stop the row.
  warning?: boolean;
}

// Where a DTO property path lands in the workbook; undefined = report on the row itself.
export type IssueLocator = (path: string) => { sheet: ImportDataSheet; row: number; key?: string } | undefined;

// Collects issues, one entry per cell: several problems on the same cell are joined into that entry. The DTO pass
// runs last with `onlyIfFree`, so a cell already reported (e.g. empty required, unknown code) is not reported again
// as "must be an enum value".
export class ImportIssueCollector {
  readonly issues: ImportIssueWithLevel[] = [];
  private readonly cells = new Map<string, ImportIssueWithLevel>();
  private readonly rowsWithErrors = new Set<string>();

  add(
    sheet: ImportDataSheet,
    row: number,
    key: string | undefined,
    code: string,
    message: string,
    warning = false,
    onlyIfFree = false,
  ) {
    const column = key ? letterOf(sheet, key) : undefined;
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

  hasError(sheet: ImportDataSheet, row: number): boolean {
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
