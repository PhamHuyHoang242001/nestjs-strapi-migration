import { SkillVersionFile, SkillVersionFileKind } from '@modules/databases/skill-version-file.entity';

// API shape of a skill version's file — a single object mirroring the diagnostic report's `file`
// field (rather than the raw skill_version_files[] rows). Carries the metadata the client needs.
export interface SkillFileResponse {
  file_url: string;
  name: string | null;
  size: number | null;
  mime_type: string | null;
}

// Fold a version's file rows down to the single zip `file` object. Returns null when the version
// has no zip row. Only the zip kind is surfaced (the sole metadata-bearing file type today).
export function toVersionFile(files?: SkillVersionFile[] | null): SkillFileResponse | null {
  const zip = (files ?? []).find((f) => f.file_kind === SkillVersionFileKind.ZIP);
  if (!zip) return null;
  return {
    file_url: zip.file_url,
    name: zip.name ?? null,
    size: zip.size ?? null,
    mime_type: zip.mime_type ?? null,
  };
}

// Reshape a version entity for API output: drop the raw files[] relation and expose the single
// `file` object instead (diagnostic-parity). Leaves every other field untouched (incl. avatar_url,
// the inline URL column that mirrors diagnostic's `icon`).
export function formatVersion<T extends { files?: SkillVersionFile[] }>(
  version: T | null | undefined,
): (Omit<T, 'files'> & { file: SkillFileResponse | null }) | null | undefined {
  if (!version) return version as null | undefined;
  const { files, ...rest } = version as T & { files?: SkillVersionFile[] };
  return { ...(rest as Omit<T, 'files'>), file: toVersionFile(files) };
}
