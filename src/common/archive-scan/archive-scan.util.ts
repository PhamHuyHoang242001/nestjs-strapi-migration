import * as fs from 'fs';
// adm-zip is a CommonJS export-assignment module. With `esModuleInterop` off, a default
// import resolves to undefined at runtime, so import-equals is the form that works here
// (same reason as skill-zip.util.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports
import AdmZip = require('adm-zip');
import { getArchiveExtension, isAllowedExt } from './allowed-extensions.const';

/**
 * Minimal shape of an uploaded file this module needs. Matches multer's disk-storage file
 * (`path` + `originalname`) so callers can pass `Express.Multer.File` straight through.
 */
export interface ScannableFile {
  path: string;
  originalname: string;
}

/**
 * Every scanner is fail-closed: any read error, corrupt archive or unreadable entry list
 * resolves to `false` rather than throwing. The Strapi original swallowed errors the same
 * way — a file we cannot inspect is a file we cannot vouch for.
 */

function scanZip(filePath: string): boolean {
  try {
    const entries = new AdmZip(filePath).getEntries();
    for (const entry of entries) {
      // Directory entries carry no extension; rejecting them would fail any nested layout.
      if (entry.isDirectory) continue;
      if (!isAllowedExt(entry.entryName)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function scanRar(filePath: string): Promise<boolean> {
  try {
    const { createExtractorFromData } = await import('node-unrar-js');
    const buffer = fs.readFileSync(filePath);
    // Copy via the typed-array constructor, not Uint8Array.from: the latter walks the buffer
    // through an iterator, one allocation per byte.
    const data = new Uint8Array(buffer).buffer;
    const extractor = await createExtractorFromData({ data });

    for (const header of extractor.getFileList().fileHeaders) {
      // Drift from Strapi: it ran isAllowedExt on directory headers too, so any rar holding
      // folders was rejected outright. Skipping them here matches what scanZip already does.
      if (header.flags?.directory) continue;
      if (!isAllowedExt(header.name)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// `7z list` rows look like: 2024-01-31 10:20:30 ....A  1234  567  path/to/file.txt
const SEVEN_ZIP_ENTRY_LINE = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+[.\w]+\s+\d*\s+\d*\s+(.+)$/;

async function scan7z(filePath: string): Promise<boolean> {
  try {
    // Loaded lazily: the wasm binary is heavy and most uploads never touch .7z.
    const SevenZip = (await import('7z-wasm')).default;

    const lines: string[] = [];
    const sevenZip = await SevenZip({
      print: (text: string) => lines.push(text),
      printErr: (text: string) => lines.push(text),
    });

    const virtualName = 'archive.7z';
    sevenZip.FS.writeFile(virtualName, fs.readFileSync(filePath));

    // A corrupt archive exits non-zero while printing no entry rows. Strapi ignored the exit
    // code, so such a file silently passed; check it so an unreadable archive fails closed
    // like every other scanner here.
    // The bundled types declare callMain as void, but the emscripten runtime returns the
    // process exit status.
    const exitCode = sevenZip.callMain(['l', virtualName]) as unknown as number | undefined;
    if (exitCode !== undefined && exitCode !== 0) return false;

    for (const line of lines) {
      const match = line.match(SEVEN_ZIP_ENTRY_LINE);
      if (!match) continue;

      const entryName = match[1].trim();
      // No dot means a directory row; nothing to validate.
      if (!entryName.includes('.')) continue;
      if (!isAllowedExt(entryName)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function scanByExtension(file: ScannableFile): Promise<boolean | null> {
  switch (getArchiveExtension(file.originalname)) {
    case '.zip':
      return scanZip(file.path);
    case '.rar':
      return scanRar(file.path);
    case '.7z':
      return scan7z(file.path);
    default:
      return null;
  }
}

/**
 * Upload gate: rejects archives holding disallowed entries.
 *
 * Non-archive files pass untouched — the Strapi middleware started from `isAccess = true`
 * and only ever flipped it for archives, so a plain .pdf (or .exe) is not extension-checked
 * here. Deliberate parity, confirmed with the product owner; do not "fix" it in isolation.
 */
export async function isArchiveContentAllowed(files: ScannableFile[]): Promise<boolean> {
  for (const file of files) {
    const result = await scanByExtension(file);
    if (result === false) return false;
  }
  return true;
}

/**
 * Stricter sibling used where the upload is REQUIRED to be an archive: anything that is not
 * a scannable archive returns `false`. Mirrors Strapi's `validateArchive`, which started
 * from `isAccess = false` — the opposite default to {@link isArchiveContentAllowed}.
 */
export async function validateArchive(file: ScannableFile): Promise<boolean> {
  const result = await scanByExtension(file);
  return result ?? false;
}
