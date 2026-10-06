import AdmZip = require('adm-zip');
import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';

const MAX_ENTRY_UNCOMPRESSED_BYTES = 5 * 1024 * 1024;

/** Basenames allowed at zip root or one wrapper folder. Add lowercase names to extend. */
export const PREVIEWABLE_ROOT_FILES = ['skill.md', 'readme.md'] as const;

export function isPreviewableZipPath(path: string): boolean {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return false;
  const base = parts[parts.length - 1].toLowerCase();
  return (PREVIEWABLE_ROOT_FILES as readonly string[]).includes(base);
}

export function normalizeZipEntryPath(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed;
}

export function readZipTextEntry(buffer: Buffer, rawPath: string | undefined | null): { path: string; content: string } {
  const path = normalizeZipEntryPath(rawPath);
  if (!path || path.split('/').some((seg) => seg === '..')) {
    throw new NotFoundException('File not found');
  }
  if (!isPreviewableZipPath(path)) {
    throw new BadRequestException('File is not previewable');
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new UnprocessableEntityException('ZIP_INVALID: could not parse zip archive');
  }

  const entry = zip.getEntries().find((e) => {
    const name = e.entryName.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
    return name === path;
  });

  if (!entry || entry.isDirectory) {
    throw new NotFoundException('File not found');
  }

  if (entry.header.size > MAX_ENTRY_UNCOMPRESSED_BYTES) {
    throw new UnprocessableEntityException(
      `ZIP_ENTRY_TOO_LARGE: entry "${path}" uncompressed size exceeds ${MAX_ENTRY_UNCOMPRESSED_BYTES}`,
    );
  }

  let data: Buffer;
  try {
    data = entry.getData();
  } catch {
    throw new UnprocessableEntityException('ZIP_INVALID: could not read zip entry');
  }
  if (data.length > MAX_ENTRY_UNCOMPRESSED_BYTES) {
    throw new UnprocessableEntityException(
      `ZIP_ENTRY_TOO_LARGE: entry uncompressed size exceeds ${MAX_ENTRY_UNCOMPRESSED_BYTES}`,
    );
  }
  if (isNonText(data)) {
    throw new BadRequestException('File is not text');
  }

  return { path, content: data.toString('utf8') };
}

function isNonText(data: Buffer): boolean {
  if (data.includes(0)) return true;
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(data);
    return Buffer.from(decoded, 'utf8').equals(data) === false;
  } catch {
    return true;
  }
}
