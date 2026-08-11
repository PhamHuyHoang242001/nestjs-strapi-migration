import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import type { SkillVersion } from './skill-version.entity';

// Files for a skill version that need full metadata (name, size, mime) — currently the zip
// archive. Replaces the former inline skill_versions.zip_url column. Mirrors the diagnostic
// file-storage model (bi_hub_diagnostic_files). The avatar is NOT stored here (it is a plain
// URL column on skill_versions); file_kind is retained as a discriminator so future metadata-
// bearing file types (e.g. screenshots) can reuse this table.
export enum SkillVersionFileKind {
  ZIP = 'zip',
}

@Entity('skill_version_files')
export class SkillVersionFile extends BaseSoftDeleteEntity {
  // FK → skill_versions. ON DELETE CASCADE: a file has no meaning without its version,
  // so hard-deleting a version removes its file rows automatically.
  @Column({ type: 'int' })
  public skill_version_id: number;

  @ManyToOne('SkillVersion', (v: SkillVersion) => v.files, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skill_version_id' })
  public skill_version: SkillVersion;

  // Discriminator for the file type. Currently only 'zip'; kept for future metadata-bearing
  // file types so they can share this table.
  @Column({ type: 'varchar' })
  public file_kind: SkillVersionFileKind;

  // Strapi URL of the uploaded file, stored as-sent (same convention as diagnostic file_url).
  @Column({ type: 'varchar' })
  public file_url: string;

  // Original filename, server-parsed from the download.
  @Column({ type: 'varchar', nullable: true })
  public name: string | null;

  // Size in bytes, server-measured from the actual download (authoritative). int suffices —
  // uploads are capped well under 2GB (zip 20MB cap).
  @Column({ type: 'int', nullable: true })
  public size: number | null;

  // MIME type, from the download response headers.
  @Column({ type: 'varchar', nullable: true })
  public mime_type: string | null;
}
