// adm-zip is a CommonJS export-assignment module. A default import resolves to
// `undefined` at runtime under this repo's tsconfig (no esModuleInterop), so
// `new AdmZip()` would throw. import-equals binds the constructor directly.
import AdmZip = require('adm-zip');
import { UnprocessableEntityException } from '@nestjs/common';
import { validateSkillMd } from './skill-md-validation.util';

// Hard caps to prevent zip-bomb attacks. Values chosen to bound memory usage
// per upload request: 200 entries × 5MB per entry = 1GB theoretical max, capped
// by the 50MB total-uncompressed limit and a 100:1 ratio guard.
const MAX_ENTRIES = 200;
const MAX_ENTRY_UNCOMPRESSED_BYTES = 5 * 1024 * 1024; // 5 MB per entry
const MAX_TOTAL_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB total
const MAX_COMPRESSION_RATIO = 100; // 100:1 ratio guard against zip bombs

/**
 * Extract and return the text content of `skill.md` from an in-memory zip buffer.
 *
 * Security guards enforced before any decompression:
 *  - Entry count cap (zip-bomb width)
 *  - Per-entry and total uncompressed size caps (zip-bomb depth)
 *  - Compression-ratio cap per entry (zip-bomb ratio)
 *  - Path-traversal check on every entry name (zip-slip)
 *
 * After extraction the content is validated against the Agent Skills standard
 * (frontmatter, name, description, line-count cap) — see validateSkillMd.
 *
 * Throws 422 if skill.md is absent or fails standard validation.
 */
export function extractSkillMdFromZip(buffer: Buffer): string {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new UnprocessableEntityException('ZIP_INVALID: could not parse zip archive');
  }

  const entries = zip.getEntries();

  // Guard: entry count — a zip with thousands of tiny files can saturate the FS.
  if (entries.length > MAX_ENTRIES) {
    throw new UnprocessableEntityException(
      `ZIP_TOO_MANY_ENTRIES: archive has ${entries.length} entries (max ${MAX_ENTRIES})`,
    );
  }

  let totalUncompressed = 0;
  let skillMdEntry: AdmZip.IZipEntry | null = null;

  for (const entry of entries) {
    // Guard: zip-slip — normalize the entry name and ensure it does not escape
    // the virtual root. Entries like "../secret" or "a/../../etc/passwd" are rejected.
    const rawName = entry.entryName.replace(/\\/g, '/');
    // Remove leading slashes then check for path traversal segments.
    const normalized = rawName.replace(/^\/+/, '');
    if (normalized.split('/').some((seg) => seg === '..')) {
      throw new UnprocessableEntityException(
        `ZIP_SLIP: entry "${rawName}" contains a path traversal segment`,
      );
    }

    if (entry.isDirectory) continue;

    const compressedSize = entry.header.compressedSize;
    const uncompressedSize = entry.header.size;

    // Guard: per-entry ratio (protects against a single deeply-compressed entry).
    if (compressedSize > 0 && uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO) {
      throw new UnprocessableEntityException(
        `ZIP_BOMB_RATIO: entry "${normalized}" compression ratio exceeds ${MAX_COMPRESSION_RATIO}:1`,
      );
    }

    // Guard: per-entry uncompressed size.
    if (uncompressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES) {
      throw new UnprocessableEntityException(
        `ZIP_ENTRY_TOO_LARGE: entry "${normalized}" uncompressed size ${uncompressedSize} bytes exceeds ${MAX_ENTRY_UNCOMPRESSED_BYTES}`,
      );
    }

    totalUncompressed += uncompressedSize;

    // Guard: total uncompressed size across all entries.
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new UnprocessableEntityException(
        `ZIP_TOTAL_TOO_LARGE: total uncompressed size exceeds ${MAX_TOTAL_UNCOMPRESSED_BYTES} bytes`,
      );
    }

    // Locate skill.md: accept at root or any subdirectory (first found wins).
    const basename = normalized.split('/').pop() ?? '';
    if (basename.toLowerCase() === 'skill.md' && !skillMdEntry) {
      skillMdEntry = entry;
    }
  }

  if (!skillMdEntry) {
    throw new UnprocessableEntityException(
      'ZIP_NO_SKILL_MD: archive must contain a skill.md file (root or subdirectory)',
    );
  }

  // Decompress only the skill.md entry — no other content is read.
  const content = zip.readAsText(skillMdEntry);
  // Enforce the Agent Skills standard on the extracted content (throws 422 on violation).
  validateSkillMd(content);
  return content;
}
