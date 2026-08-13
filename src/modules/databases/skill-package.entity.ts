import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import type { SkillVersion } from './skill-version.entity';

// Status controls approver-facing visibility toggle. 'inactive' hides from public list
// but does NOT delete versions; liveness is tracked separately via active_version_id.
export enum SkillPackageStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('skill_packages')
export class SkillPackage extends BaseSoftDeleteEntity {
  // Points to the currently published version. SET NULL when that version is deleted
  // so the package survives without a live version (can be re-published later).
  @Column({ nullable: true, type: 'int' })
  public active_version_id: number | null;

  @Column({ type: 'varchar', default: SkillPackageStatus.ACTIVE })
  public status: SkillPackageStatus;

  // Stable public code `skill_<id>` — a bijection of the primary key. Stored + backfilled and set
  // post-insert inside the create transaction (id is known only after insert). Intentionally NOT
  // unique-indexed: derived from the PK it can never collide, so a unique index is dead weight.
  @Column({ type: 'varchar' })
  public code: string;

  // User who originally created/submitted the package (plain FK, no decorator — auth user).
  @Column({ type: 'int' })
  public created_by: number;

  // Eager relation to the active version (read-only navigation property).
  // lazy import avoids circular dependency between SkillPackage ↔ SkillVersion.
  @OneToOne('SkillVersion', { nullable: true, eager: false })
  @JoinColumn({ name: 'active_version_id' })
  public active_version: SkillVersion | null;
}
