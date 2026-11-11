// Exports written with the import layouts: same sheet name, column names and order, and the values in the form the
// import reads (codes, names, `;`-separated lists). An exported file can be edited and imported back as is.
import { ExportExcelSheet } from '@common/utils/export-excel.helper';
import { headerText, ImportLayout, sheetDef, STT_KEY } from './import-workbook.util';

export function layoutSheet(
  layout: ImportLayout,
  rows: Array<Record<string, unknown>>,
  sheetKey = layout.primarySheets[0],
): ExportExcelSheet {
  const def = sheetDef(layout, sheetKey);
  const numbered = def.columns.some((c) => c.key === STT_KEY);
  return {
    sheetName: def.name,
    columns: def.columns.map((c) => ({ header: headerText(c), key: c.key, width: c.width })),
    rows: numbered ? rows.map((row, i) => ({ ...row, [STT_KEY]: i + 1 })) : rows,
  };
}

// `;`-separated list cell, as the import splits it.
export const listCell = (values: Array<string | null | undefined>): string =>
  values.filter((v): v is string => Boolean(v)).join('; ');
