// Zip-bomb guard of the uploaded .xlsx, run before ExcelJS parses it. The upload limit only caps the compressed
// bytes; ExcelJS inflates every part and builds an object per cell, so a small file of repeated (empty) cells could
// take gigabytes. Every part is inflated here with a hard output cap (the sizes declared in the zip are not
// trusted), then the cells of the worksheets are counted.
import { BadRequestException } from '@nestjs/common';
import { inflateRawSync } from 'zlib';
// adm-zip is a CommonJS export-assignment module; without esModuleInterop a default import is undefined at runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import AdmZip = require('adm-zip');

export interface XlsxLimits {
  maxEntries: number;
  // Total inflated bytes of all parts (largest real upload measured: ~25MB, 5000 rows of long text).
  maxTotalBytes: number;
  // Cells over all worksheets (largest real upload: 5000 rows x 9 columns).
  maxCells: number;
}

export const XLSX_LIMITS: XlsxLimits = {
  maxEntries: 200,
  maxTotalBytes: 60 * 1024 * 1024,
  maxCells: 100_000,
};

const STORED = 0;
const DEFLATED = 8;
const WORKSHEET = /^xl\/worksheets\/[^/]+\.xml$/i;
// A cell element, with or without a namespace prefix: <c ...>, <c>, <c/>, <x:c ...>.
const CELL = /<(?:[A-Za-z_][\w.-]*:)?c[\s>/]/g;

const reject = (reason: string): never => {
  throw new BadRequestException(`FILE_TOO_LARGE: ${reason}`);
};

// Inflated bytes of one part, never more than `budget` (+1 to detect the overflow).
function inflateEntry(entry: AdmZip.IZipEntry, budget: number): Buffer {
  const raw = entry.getCompressedData();
  if (entry.header.method === STORED) return raw.length > budget ? reject('file giải nén quá lớn') : raw;
  if (entry.header.method !== DEFLATED) {
    throw new BadRequestException('INVALID_FILE: file .xlsx dùng kiểu nén không hỗ trợ');
  }
  try {
    return inflateRawSync(raw, { maxOutputLength: budget + 1 });
  } catch (err) {
    if (err instanceof RangeError || (err as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') {
      return reject('file giải nén quá lớn');
    }
    throw new BadRequestException('INVALID_FILE: không đọc được file .xlsx');
  }
}

export function assertXlsxWithinLimits(file: Buffer, limits: XlsxLimits = XLSX_LIMITS): void {
  let entries: AdmZip.IZipEntry[];
  try {
    entries = new AdmZip(file).getEntries();
  } catch {
    throw new BadRequestException('INVALID_FILE: không đọc được file .xlsx');
  }
  if (entries.length > limits.maxEntries) reject(`file có quá nhiều phần (${entries.length})`);

  let total = 0;
  let cells = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (entry.header.size > limits.maxTotalBytes - total) reject('file giải nén quá lớn');
    const data = inflateEntry(entry, limits.maxTotalBytes - total);
    total += data.length;
    if (total > limits.maxTotalBytes) reject('file giải nén quá lớn');
    if (WORKSHEET.test(entry.entryName)) {
      cells += data.toString('latin1').match(CELL)?.length ?? 0;
      if (cells > limits.maxCells) reject(`file có quá nhiều ô dữ liệu (tối đa ${limits.maxCells})`);
    }
  }
}
