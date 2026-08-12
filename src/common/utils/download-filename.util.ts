// Filename helpers for download endpoints (skill zip / prompt md). Kept module-neutral in
// common/utils so the skill and prompt modules share one slugify implementation (DRY) rather
// than importing across feature-module boundaries.

// Convert an arbitrary display name to a lowercase kebab-case ASCII slug safe for a filename.
// Strips diacritics, collapses runs of non-alphanumerics to a single hyphen, trims edge hyphens.
// Returns '' for empty/undefined input so callers can apply their own fallback.
export function slugify(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .normalize('NFKD') // split accented chars into base letter + combining marks
    .replace(/\p{Diacritic}/gu, '') // drop the combining marks (diacritics)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // any run of non-alphanumerics -> single hyphen
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}

// Build a download filename of the form "<slug|fallback>-v<versionNo>.<ext>".
// The version number guarantees uniqueness even when two versions share a name.
export function buildDownloadFilename(
  name: string | null | undefined,
  versionNo: number,
  ext: string,
  fallback: string,
): string {
  const slug = slugify(name) || fallback;
  return `${slug}-v${versionNo}.${ext}`;
}
