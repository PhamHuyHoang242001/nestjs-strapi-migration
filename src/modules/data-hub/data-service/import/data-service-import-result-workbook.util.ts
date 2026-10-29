import * as ExcelJS from 'exceljs';
import { IMPORT_SHEETS, ImportDataSheet, SHEET_COLUMNS } from './data-service-import-sheet-columns';
import { ImportIssueWithLevel } from './data-service-import-issue-collector.util';

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

const DATA_SHEETS: ImportDataSheet[] = ['API', 'SFTP', 'TERMS', 'LOGICAL'];

// Writes "Kết quả" and "Chi tiết" columns after the template columns of every data sheet of the uploaded workbook,
// so the user fixes the rows in the same file and uploads it again (the two extra columns are ignored on read).
export async function buildResultWorkbook(
  workbook: ExcelJS.Workbook,
  results: Map<string, RowResult>,
  issues: ImportIssueWithLevel[],
): Promise<Buffer> {
  const issuesByRow = new Map<ImportDataSheet, Map<number, ImportIssueWithLevel[]>>();
  for (const i of issues) {
    const bySheet = issuesByRow.get(i.sheet) ?? new Map<number, ImportIssueWithLevel[]>();
    bySheet.set(i.row, [...(bySheet.get(i.row) ?? []), i]);
    issuesByRow.set(i.sheet, bySheet);
  }
  for (const key of DATA_SHEETS) {
    const sheet = workbook.getWorksheet(IMPORT_SHEETS[key]);
    if (!sheet) continue;
    const statusCol = SHEET_COLUMNS[key].length + 1;
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
