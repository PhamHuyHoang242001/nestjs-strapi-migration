# Phase 1 — Install exceljs & Create Shared Export Utility

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 0.5h

## Implementation Steps

### Step 1: Install exceljs

```bash
npm install exceljs
```

### Step 2: Create shared export utility

**File:** `src/common/utils/export-excel.helper.ts`

```typescript
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import * as dayjs from 'dayjs';

export interface ExcelColumn {
  header: string;  // Display label in Excel header row
  key: string;     // Key to extract from row data
  width?: number;  // Column width (default 20)
}

export interface ExportExcelOptions {
  sheetName: string;
  columns: ExcelColumn[];
  rows: Record<string, any>[];
}

/**
 * Generate Excel workbook and stream to HTTP response.
 * Shared utility — usable by any module needing Excel export.
 */
export async function exportExcelToResponse(res: Response, options: ExportExcelOptions): Promise<void> {
  const { sheetName, columns, rows } = options;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  // Set columns with headers and widths
  sheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width || 20,
  }));

  // Bold header row
  sheet.getRow(1).font = { bold: true };

  // Add data rows
  rows.forEach((row) => sheet.addRow(row));

  // Set response headers and stream
  const fileName = `${sheetName}_${dayjs().format('DD-MM-YYYY_HHmm')}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  await workbook.xlsx.write(res);
  res.end();
}
```

### Step 3: Check existing utils barrel export

If `src/common/utils/index.ts` exists, add export. Otherwise the helper is imported directly.

## Success Criteria
- [ ] `exceljs` installed in package.json
- [ ] `export-excel.helper.ts` created with `exportExcelToResponse()` function
- [ ] Compile passes
