// eslint-disable-next-line @typescript-eslint/no-require-imports
import AdmZip = require('adm-zip');
import { SOURCE_TABLE_IMPORT_LAYOUT } from '../import-layouts';
import { assertXlsxWithinLimits, XLSX_LIMITS } from '../import-xlsx-size-guard.util';
import { buildImportTemplate, loadImportWorkbook } from '../import-workbook.util';
import { loadBook } from './import-test-helpers';

// A zip holding the given parts (deflated), like an .xlsx.
function zipOf(parts: Record<string, Buffer | string>): Buffer {
  const zip = new AdmZip();
  for (const [name, data] of Object.entries(parts)) zip.addFile(name, Buffer.isBuffer(data) ? data : Buffer.from(data));
  return zip.toBuffer();
}

// Worksheet XML with `n` empty cells: tiny once compressed.
const emptyCells = (n: number) =>
  `<worksheet><sheetData><row r="1">${'<c r="A1"/>'.repeat(n)}</row></sheetData></worksheet>`;

describe('assertXlsxWithinLimits', () => {
  it('a sheet of a million empty cells (a few KB compressed) is refused before parsing', async () => {
    const bomb = zipOf({ 'xl/worksheets/sheet1.xml': emptyCells(1_200_000) });
    expect(bomb.length).toBeLessThan(200 * 1024);
    expect(() => assertXlsxWithinLimits(bomb)).toThrow(/FILE_TOO_LARGE.*quá nhiều ô/);
    // The import path refuses it the same way, before ExcelJS loads it.
    await expect(loadImportWorkbook(bomb, SOURCE_TABLE_IMPORT_LAYOUT)).rejects.toThrow(/FILE_TOO_LARGE/);
  });

  it('counts cells written with a namespace prefix too', () => {
    const xml = `<x:worksheet><x:sheetData>${'<x:c r="A1"></x:c>'.repeat(50)}</x:sheetData></x:worksheet>`;
    const file = zipOf({ 'xl/worksheets/sheet1.xml': xml });
    expect(() => assertXlsxWithinLimits(file, { ...XLSX_LIMITS, maxCells: 49 })).toThrow(/quá nhiều ô/);
    expect(() => assertXlsxWithinLimits(file, { ...XLSX_LIMITS, maxCells: 50 })).not.toThrow();
  });

  it('a part inflating past the total budget is refused', () => {
    const file = zipOf({ 'xl/sharedStrings.xml': Buffer.alloc(XLSX_LIMITS.maxTotalBytes + 1024, 0x20) });
    expect(() => assertXlsxWithinLimits(file)).toThrow(/FILE_TOO_LARGE.*giải nén quá lớn/);
  });

  it('does not trust the sizes declared in the zip: a part claiming 10 bytes is still capped', () => {
    const file = zipOf({ 'xl/sharedStrings.xml': Buffer.alloc(4096, 0x20) });
    // Patch the uncompressed size of the central directory record (offset 24) to 10 bytes.
    const central = file.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    file.writeUInt32LE(10, central + 24);
    expect(new AdmZip(file).getEntries()[0].header.size).toBe(10);
    expect(() => assertXlsxWithinLimits(file, { ...XLSX_LIMITS, maxTotalBytes: 1000 })).toThrow(/giải nén quá lớn/);
  });

  it('too many parts, or a file that is not a zip, is refused', () => {
    const parts: Record<string, string> = {};
    for (let i = 0; i <= XLSX_LIMITS.maxEntries; i++) parts[`xl/p${i}.xml`] = '<a/>';
    expect(() => assertXlsxWithinLimits(zipOf(parts))).toThrow(/quá nhiều phần/);
    expect(() => assertXlsxWithinLimits(Buffer.from('not a zip'))).toThrow(/INVALID_FILE/);
  });

  it('the largest real upload (5000 rows x 9 columns of long text) passes', async () => {
    const wb = await loadBook(await buildImportTemplate({ layout: SOURCE_TABLE_IMPORT_LAYOUT }));
    const sheet = wb.worksheets[0];
    const columns = SOURCE_TABLE_IMPORT_LAYOUT.sheets[0].columns;
    for (let r = 2; r <= 5001; r++) {
      columns.forEach((c, i) => (sheet.getCell(r, i + 1).value = `${c.key} ${r} ${'mô tả kỹ thuật '.repeat(20)}`));
    }
    const file = Buffer.from(await wb.xlsx.writeBuffer());
    expect(() => assertXlsxWithinLimits(file)).not.toThrow();
  });
});
