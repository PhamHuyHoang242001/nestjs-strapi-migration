import * as crypto from 'crypto';
import * as path from 'path';

/**
 * Slug rules mirror Strapi's `nameToSlug`: strip diacritics, lowercase, collapse anything
 * outside [a-z0-9] into a single underscore.
 */
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // drop combining accents left by NFD
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export interface StoredFileName {
  /** Strapi's `hash`: the stored base name without extension. */
  hash: string;
  /** Lowercased extension including the dot, or '' when the original had none. */
  ext: string;
  /** What actually lands on disk: `${hash}${ext}`. */
  fileName: string;
}

/**
 * Builds the on-disk name for an upload.
 *
 * The random suffix is what keeps two uploads of the same original name from overwriting
 * each other, so it is not optional decoration.
 */
/**
 * Keeps only extensions that look like real ones.
 *
 * `path.extname` hands back whatever followed the last dot, so a crafted upload named
 * `x.<script>` would otherwise put those characters into the stored file name and into the
 * public `url` column that the frontend renders.
 */
function sanitizeExt(rawExt: string): string {
  const ext = rawExt.toLowerCase();
  return /^\.[a-z0-9]{1,12}$/.test(ext) ? ext : '';
}

export function buildStoredFileName(originalName: string): StoredFileName {
  const ext = sanitizeExt(path.extname(originalName));
  const base = slugify(path.basename(originalName, path.extname(originalName)));
  const suffix = crypto.randomBytes(5).toString('hex');

  // An all-punctuation name slugs down to '' — fall back so the file is never just "_abc123".
  const hash = `${base || 'file'}_${suffix}`;

  return { hash, ext, fileName: `${hash}${ext}` };
}
