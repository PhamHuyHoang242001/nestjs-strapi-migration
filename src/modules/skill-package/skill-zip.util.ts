// adm-zip is a CommonJS export-assignment module. A default import resolves to
// `undefined` at runtime under this repo's tsconfig (no esModuleInterop), so
// `new AdmZip()` would throw. import-equals binds the constructor directly.
import AdmZip = require('adm-zip');
import { UnprocessableEntityException } from '@nestjs/common';
import { validateSkillMd } from './skill-md-validation.util';
import type { ZipTreeNode } from '@modules/databases/skill-version.entity';

export type { ZipTreeNode };

// Hard caps to prevent zip-bomb attacks. Values chosen to bound memory usage
// per upload request: 200 entries × 5MB per entry = 1GB theoretical max, capped
// by the 50MB total-uncompressed limit and a 100:1 ratio guard.
const MAX_ENTRIES = 200;
const MAX_ENTRY_UNCOMPRESSED_BYTES = 5 * 1024 * 1024; // 5 MB per entry
const MAX_TOTAL_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB total
const MAX_COMPRESSION_RATIO = 100; // 100:1 ratio guard against zip bombs
// Files + synthesized parent dirs. 200 unique 3-level paths ≈ 800 nodes; 1024 leaves headroom.
const MAX_TREE_NODES = 1024;

export interface ExtractedSkillZip {
  skillMd: string;
  zipTree: ZipTreeNode[];
}

/**
 * Parse a skill zip once: security-scan every entry, extract skill.md, build the folder tree.
 * Throws 422 if skill.md is absent or fails Agent Skills validation.
 */
export function extractSkillZip(buffer: Buffer): ExtractedSkillZip {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new UnprocessableEntityException('ZIP_INVALID: could not parse zip archive');
  }

  const entries = zip.getEntries();

  if (entries.length > MAX_ENTRIES) {
    throw new UnprocessableEntityException(
      `ZIP_TOO_MANY_ENTRIES: archive has ${entries.length} entries (max ${MAX_ENTRIES})`,
    );
  }

  let totalUncompressed = 0;
  let skillMdEntry: AdmZip.IZipEntry | null = null;
  const nodes = new Map<string, ZipTreeNode>();

  for (const entry of entries) {
    const rawName = entry.entryName.replace(/\\/g, '/');
    const normalized = rawName.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!normalized) continue;
    if (normalized.split('/').some((seg) => seg === '..')) {
      throw new UnprocessableEntityException(
        `ZIP_SLIP: entry "${rawName}" contains a path traversal segment`,
      );
    }

    if (entry.isDirectory) {
      nodes.set(normalized, { path: normalized, isDir: true, size: null });
      continue;
    }

    const compressedSize = entry.header.compressedSize;
    const uncompressedSize = entry.header.size;

    if (compressedSize > 0 && uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO) {
      throw new UnprocessableEntityException(
        `ZIP_BOMB_RATIO: entry "${normalized}" compression ratio exceeds ${MAX_COMPRESSION_RATIO}:1`,
      );
    }

    if (uncompressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES) {
      throw new UnprocessableEntityException(
        `ZIP_ENTRY_TOO_LARGE: entry "${normalized}" uncompressed size ${uncompressedSize} bytes exceeds ${MAX_ENTRY_UNCOMPRESSED_BYTES}`,
      );
    }

    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new UnprocessableEntityException(
        `ZIP_TOTAL_TOO_LARGE: total uncompressed size exceeds ${MAX_TOTAL_UNCOMPRESSED_BYTES} bytes`,
      );
    }

    nodes.set(normalized, { path: normalized, isDir: false, size: uncompressedSize });

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

  synthesizeParents(nodes);
  if (nodes.size > MAX_TREE_NODES) {
    throw new UnprocessableEntityException(
      `ZIP_TREE_TOO_WIDE: tree has ${nodes.size} nodes (max ${MAX_TREE_NODES})`,
    );
  }

  const content = zip.readAsText(skillMdEntry);
  validateSkillMd(content);
  return { skillMd: content, zipTree: Array.from(nodes.values()) };
}

/** @deprecated Prefer extractSkillZip. Kept so e2e helpers that only need skill.md still compile. */
export function extractSkillMdFromZip(buffer: Buffer): string {
  return extractSkillZip(buffer).skillMd;
}

function synthesizeParents(nodes: Map<string, ZipTreeNode>): void {
  for (const path of Array.from(nodes.keys())) {
    const parts = path.split('/');
    let acc = '';
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      if (!nodes.has(acc)) {
        nodes.set(acc, { path: acc, isDir: true, size: null });
      }
    }
  }
}
