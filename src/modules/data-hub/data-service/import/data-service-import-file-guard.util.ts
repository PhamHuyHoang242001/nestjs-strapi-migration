import { BadRequestException } from '@nestjs/common';
import * as JSZip from 'jszip';

// Caps checked on the raw .xlsx before exceljs parses it. exceljs keeps every sheet in memory and expands each
// data-validation range into one entry per cell, so a few-KB file with a huge sheet (zip bomb) or a validation
// over a whole column (Excel's "apply to entire column") would take seconds and gigabytes, blocking the server.
const MAX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;
// The template validates about 20 columns x 1000-5000 rows; anything far beyond that was not made from it.
const MAX_VALIDATION_CELLS = 300_000;

const colNumber = (letters: string): number => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

// Cells covered by an sqref such as "A2:A1001 C5" (absent row/column parts mean the whole sheet axis).
export function sqrefCells(sqref: string): number {
  return sqref
    .split(/\s+/)
    .filter(Boolean)
    .reduce((sum, range) => {
      const [from, to = from] = range.replace(/\$/g, '').split(':');
      const a = /^([A-Z]*)(\d*)$/.exec(from);
      const b = /^([A-Z]*)(\d*)$/.exec(to);
      if (!a || !b) return sum + MAX_VALIDATION_CELLS;
      const cols = Math.abs(colNumber(b[1] || 'XFD') - colNumber(a[1] || 'A')) + 1;
      const rows = Math.abs(Number(b[2] || 1048576) - Number(a[2] || 1)) + 1;
      return sum + cols * rows;
    }, 0);
}

interface ZipEntryInternals {
  _data?: { uncompressedSize?: number };
}

export async function assertSafeWorkbook(file: Buffer): Promise<void> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new BadRequestException('INVALID_FILE: không đọc được file .xlsx');
  }
  // Declared sizes come from the zip directory, read without inflating anything.
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  const total = entries.reduce((sum, f) => sum + ((f as unknown as ZipEntryInternals)._data?.uncompressedSize ?? 0), 0);
  if (total > MAX_UNCOMPRESSED_BYTES) {
    throw new BadRequestException('INVALID_FILE: file quá lớn sau khi giải nén, hãy dùng template import');
  }
  let cells = 0;
  for (const f of entries.filter((e) => /^xl\/worksheets\/[^/]+\.xml$/.test(e.name))) {
    const xml = await f.async('string');
    for (const m of xml.matchAll(/<dataValidation\b[^>]*\ssqref="([^"]+)"/g)) cells += sqrefCells(m[1]);
    // Newer Excel writes x14 validations with the range in an <xm:sqref> element.
    for (const m of xml.matchAll(/<xm:sqref>([^<]+)<\/xm:sqref>/g)) cells += sqrefCells(m[1]);
  }
  if (cells > MAX_VALIDATION_CELLS) {
    throw new BadRequestException(
      'INVALID_FILE: file có dropdown/validation phủ quá nhiều ô (vd cả cột), hãy tải lại template import',
    );
  }
}
