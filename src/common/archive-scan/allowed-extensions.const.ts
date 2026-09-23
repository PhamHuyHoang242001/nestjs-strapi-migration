import * as path from 'path';

/**
 * Extensions permitted INSIDE an uploaded archive.
 *
 * Ported verbatim from the Strapi upload middleware's `isAllowedExt` allowlist — do not
 * extend it casually. Note `.zip`/`.rar`/`.7z` are absent, so an archive nested inside
 * another archive is rejected; that is the intended behaviour, not an oversight.
 */
export const ALLOWED_ARCHIVE_ENTRY_EXTENSIONS: readonly string[] = [
  '.xlsx',
  '.xlsm',
  '.csv',
  '.xlsb',
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.msg',
  '.eml',
  '.docx',
  '.pptx',
  '.html',
  // Skill-package payloads: skill.md + scripts/references/assets attachments.
  '.md',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.py',
  '.sh',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.svg',
  '.css',
];

/** Extensions treated as archives, i.e. the files whose contents get scanned. */
export const SCANNED_ARCHIVE_EXTENSIONS = ['.zip', '.rar', '.7z'] as const;

export type ScannedArchiveExtension = (typeof SCANNED_ARCHIVE_EXTENSIONS)[number];

/** True when an entry name carries one of the allowed extensions (case-insensitive). */
export function isAllowedExt(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return ALLOWED_ARCHIVE_ENTRY_EXTENSIONS.includes(ext);
}

/** Archive kind for a file name, or null when it is not an archive we scan. */
export function getArchiveExtension(fileName: string): ScannedArchiveExtension | null {
  const ext = path.extname(fileName).toLowerCase();
  return (SCANNED_ARCHIVE_EXTENSIONS as readonly string[]).includes(ext) ? (ext as ScannedArchiveExtension) : null;
}
