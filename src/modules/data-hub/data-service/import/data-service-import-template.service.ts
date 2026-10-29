import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import {
  DataHubApiAuthType,
  DataHubApiBaseUrl,
  DataHubApiMethod,
  DataHubApiSyncMode,
  DataHubApiUpdateFrequency,
  DataHubSftpEncryption,
  DataHubSftpExportFrequency,
  DataHubSftpFileFormat,
  DataHubSftpFlowDirection,
} from '@modules/databases/data-hub-enums';
import { activeSql, liveSql } from '../../common/data-hub-query.util';
import { fillExampleRows } from './data-service-import-template-example.util';
import { GUIDE_LINES } from './data-service-import-template-guide';
import {
  headerText,
  IMPORT_LIMITS,
  IMPORT_SHEETS,
  ImportDataSheet,
  ImportListKey,
  SHEET_COLUMNS,
} from './data-service-import-sheet-columns';
import { columnLetter } from './data-service-import-workbook-reader.util';

// One dropdown source on DANH_MUC: codes (what the cell takes) and, for org lists, the names beside them.
export interface ImportList {
  key: ImportListKey;
  header: string;
  codes: string[];
  names?: string[];
}

const enumList = (key: ImportListKey, header: string, e: Record<string, string>): ImportList => ({
  key,
  header,
  codes: Object.values(e),
});

type RangeValidations = { dataValidations: { add(address: string, rule: ExcelJS.DataValidation): void } };

const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFDCEFE8' } };
const REQUIRED_FONT = { bold: true, color: { argb: 'FFB4232C' } };

// Builds the import template: guide, the four data sheets (text-formatted cells, dropdowns, a note on every
// header) and DANH_MUC filled from the database at download time.
@Injectable()
export class DataServiceImportTemplateService {
  constructor(private readonly dataSource: DataSource) {}

  async build(example?: { email: string }): Promise<Buffer> {
    const lists = await this.loadLists();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Data Hub';

    const guide = workbook.addWorksheet(IMPORT_SHEETS.GUIDE);
    guide.getColumn(1).width = 120;
    GUIDE_LINES.forEach((line, i) => {
      const cell = guide.getCell(i + 1, 1);
      cell.value = line;
      cell.alignment = { wrapText: true, vertical: 'top' };
      if (i === 0) cell.font = { bold: true, size: 14 };
      else if (/^[0-9A-Z].*:$/.test(line)) cell.font = { bold: true };
    });

    const listColumn = new Map<ImportListKey, { letter: string; size: number }>();
    let next = 0;
    for (const l of lists) {
      listColumn.set(l.key, { letter: columnLetter(next), size: l.codes.length });
      next += l.names ? 2 : 1;
    }
    (['API', 'SFTP', 'TERMS', 'LOGICAL'] as ImportDataSheet[]).forEach((key) =>
      this.addDataSheet(workbook, key, listColumn),
    );
    this.addListSheet(workbook, lists);
    if (example) fillExampleRows(workbook, lists, example.email);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private addDataSheet(
    workbook: ExcelJS.Workbook,
    key: ImportDataSheet,
    listColumn: Map<ImportListKey, { letter: string; size: number }>,
  ): void {
    const sheet = workbook.addWorksheet(IMPORT_SHEETS[key], { views: [{ state: 'frozen', ySplit: 1 }] });
    // Dropdown rows: the term sheet holds up to TERM_ROWS rows, the other sheets far fewer.
    const last = (key === 'TERMS' ? IMPORT_LIMITS.TERM_ROWS : IMPORT_LIMITS.TEMPLATE_ROWS) + 1;
    SHEET_COLUMNS[key].forEach((c, i) => {
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
      const list = c.list ? listColumn.get(c.list) : undefined;
      if (list && list.size > 0) {
        const letter = columnLetter(i);
        // One rule for the whole column range (exceljs supports it; its typings only declare per-cell rules).
        (sheet as unknown as RangeValidations).dataValidations.add(`${letter}2:${letter}${last}`, {
          type: 'list',
          allowBlank: true,
          formulae: [`${IMPORT_SHEETS.LISTS}!$${list.letter}$2:$${list.letter}$${list.size + 1}`],
          showErrorMessage: true,
          errorStyle: 'stop',
          errorTitle: 'Giá trị không hợp lệ',
          error: `Chọn một giá trị trong danh sách (sheet ${IMPORT_SHEETS.LISTS}).`,
        });
      }
    });
    sheet.getRow(1).height = 32;
  }

  private addListSheet(workbook: ExcelJS.Workbook, lists: ImportList[]): void {
    const sheet = workbook.addWorksheet(IMPORT_SHEETS.LISTS, { views: [{ state: 'frozen', ySplit: 1 }] });
    let col = 1;
    for (const l of lists) {
      const header = sheet.getCell(1, col);
      header.value = l.names ? `${l.header} (mã)` : l.header;
      header.font = { bold: true };
      header.fill = HEADER_FILL;
      sheet.getColumn(col).width = Math.max(16, l.header.length + 6);
      l.codes.forEach((code, i) => (sheet.getCell(i + 2, col).value = code));
      if (l.names) {
        const nameHeader = sheet.getCell(1, col + 1);
        nameHeader.value = `${l.header} (tên)`;
        nameHeader.font = { bold: true };
        nameHeader.fill = HEADER_FILL;
        sheet.getColumn(col + 1).width = 32;
        l.names.forEach((name, i) => (sheet.getCell(i + 2, col + 1).value = name));
        col++;
      }
      col++;
    }
    // Read-only for the user: dropdowns point at these cells.
    void sheet.protect('', { selectLockedCells: true, selectUnlockedCells: true });
  }

  private async loadLists(): Promise<ImportList[]> {
    const org = async (table: string, header: string, key: ImportListKey, extra = ''): Promise<ImportList> => {
      const rows: Array<{ code: string; name: string }> = await this.dataSource.query(
        `SELECT t.code, t.name FROM ${table} t WHERE ${liveSql('t')}${extra} ORDER BY t.code`,
      );
      return { key, header, codes: rows.map((r) => r.code), names: rows.map((r) => r.name) };
    };
    const [requestUnits, divisions, departments, consumers] = await Promise.all([
      org('data_hub_request_units', 'Đơn vị yêu cầu', 'request_units'),
      org('data_hub_divisions', 'Khối chủ quản', 'divisions'),
      org('data_hub_departments', 'Đơn vị quản lý', 'departments'),
      org('data_hub_consumers', 'App thụ hưởng', 'consumers', ` AND ${activeSql('t')}`),
    ]);
    return [
      requestUnits,
      divisions,
      departments,
      consumers,
      enumList('method', 'Method', DataHubApiMethod),
      enumList('base_url', 'Base URL', DataHubApiBaseUrl),
      enumList('api_auth_type', 'Auth type', DataHubApiAuthType),
      enumList('update_frequency', 'Tần suất cập nhật', DataHubApiUpdateFrequency),
      enumList('sync_mode', 'Chế độ đồng bộ', DataHubApiSyncMode),
      enumList('file_format', 'Định dạng file', DataHubSftpFileFormat),
      enumList('export_frequency', 'Tần suất xuất', DataHubSftpExportFrequency),
      enumList('encryption', 'Mã hoá', DataHubSftpEncryption),
      enumList('flow_direction', 'Chiều luồng', DataHubSftpFlowDirection),
      { key: 'yes_no', header: 'Có/Không', codes: ['Có', 'Không'] },
    ];
  }
}
