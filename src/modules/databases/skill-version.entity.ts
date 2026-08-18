import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { SkillPackage } from './skill-package.entity';
import type { SkillVersionFile } from './skill-version-file.entity';

// Lifecycle: pending → approved | rejected. No 'archived' state; liveness is determined
// by skill_packages.active_version_id pointing to this row (M7 decision).
export enum SkillVersionState {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('skill_versions')
export class SkillVersion extends BaseSoftDeleteEntity {
  // FK → skill_packages ON DELETE RESTRICT — prevents orphaned versions;
  // caller must archive/delete versions before deleting a package.
  @Column({ type: 'int' })
  public skill_package_id: number;

  @ManyToOne(() => SkillPackage, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'skill_package_id' })
  public skill_package: SkillPackage;

  // Monotonic counter assigned at submit time (not approve time — H1 decision).
  // Enforced unique per package via DB constraint; application computes max+1 inside
  // the pending-guard transaction so a 23505 violation maps to a 409 response.
  @Column({ type: 'int' })
  public version_no: number;

  // Predecessor approved version_no this row builds on (NULL for the first-ever version).
  // Numbering mechanic: an update sets old_version = latest approved non-deleted version_no and
  // version_no = old_version (a placeholder sharing the live number); approve finalizes
  // version_no = (old_version ?? 0) + 1. A pending row with old_version IS NULL is the "mới" signal.
  // version_no stays NOT NULL; only this predecessor label is nullable.
  @Column({ type: 'int', nullable: true })
  public old_version: number | null;

  @Column({ type: 'varchar', default: SkillVersionState.PENDING })
  public state: SkillVersionState;

  @Column({ type: 'varchar' })
  public name: string;

  @Column({ type: 'text' })
  public short_description: string;

  // Single category string; enum enforcement is application-level, kept per user decision.
  @Column({ type: 'varchar' })
  public category: string;

  @Column({ type: 'int', nullable: true })
  public category_id: number | null;

  // Freeform tag array stored as JSONB for flexible querying without a join table.
  @Column({ type: 'jsonb', default: '[]' })
  public tags: string[];

  // Strapi URL of the uploaded avatar image, stored directly (nullable, URL only — no metadata).
  // Served back to the client verbatim; origin is validated against the Strapi host at submit.
  // The avatar is intentionally NOT modelled as a skill_version_files row (unlike the zip): it
  // needs no name/size/mime, so a plain column is the right fit.
  @Column({ type: 'varchar', nullable: true })
  public avatar_url: string | null;

  // Zip file(s) for this version — the skill archive, carrying full metadata (name, size, mime)
  // in skill_version_files. That table is for files needing metadata; currently exactly one zip
  // per version. The zip is fetched at submit time to unzip/validate/extract skill.md.
  @OneToMany('SkillVersionFile', (f: SkillVersionFile) => f.skill_version)
  public files: SkillVersionFile[];

  // Extracted text content of skill.md from the zip; used for diff rendering on review.
  @Column({ type: 'text' })
  public skill_md_content: string;

  // Optional release note; required only when bumping an existing package (not first upload).
  @Column({ type: 'text', nullable: true })
  public changelog_note: string | null;

  // User who submitted this version (plain FK, no decorator).
  @Column({ type: 'int' })
  public submitted_by: number;

  // Reviewer fields — all nullable until a review action is taken.
  @Column({ type: 'int', nullable: true })
  public reviewed_by: number | null;

  @Column({ type: 'timestamp without time zone', nullable: true })
  public reviewed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  public reject_reason: string | null;
}
