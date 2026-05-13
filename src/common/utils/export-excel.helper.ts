import * as ExcelJS from 'exceljs';
import dayjs from 'dayjs';
import { Response } from 'express';

export interface ExcelColumn {
  header: string; // Display label in Excel header row
  key: string; // Key to extract from row data
  width?: number; // Column width (default 20)
}

export interface ExportExcelOptions {
  sheetName: string;
  columns: ExcelColumn[];
  rows: Record<string, any>[];
}

// Generate Excel workbook and stream to HTTP response.
// Shared utility — usable by any module needing Excel export.
export async function exportExcelToResponse(res: Response, options: ExportExcelOptions): Promise<void> {
  const { sheetName, columns, rows } = options;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width || 20,
  }));

  // Bold header row
  sheet.getRow(1).font = { bold: true };

  rows.forEach((row) => sheet.addRow(row));

  const safeName = sheetName.replace(/[^a-zA-Z0-9_-]/g, '_');
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
