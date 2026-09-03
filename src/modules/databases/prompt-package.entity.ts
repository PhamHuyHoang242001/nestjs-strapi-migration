import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import type { PromptVersion } from './prompt-version.entity';

// Status controls approver-facing visibility toggle. 'inactive' hides from public list
// but does NOT delete versions; liveness is tracked separately via active_version_id.
export enum PromptPackageStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('prompt_packages')
export class PromptPackage extends BaseSoftDeleteEntity {
  // Points to the currently published version. SET NULL when that version is deleted
  // so the package survives without a live version (can be re-published later).
  @Column({ nullable: true, type: 'int' })
  public active_version_id: number | null;

  @Column({ type: 'varchar', default: PromptPackageStatus.ACTIVE })
  public status: PromptPackageStatus;

  // Stable public code `prompt_<id>` — a bijection of the primary key. Stored + backfilled and set
  // post-insert inside the create transaction (id is known only after insert). Intentionally NOT
  // unique-indexed: derived from the PK it can never collide, so a unique index is dead weight.
  @Column({ type: 'varchar' })
  public code: string;

  // User who originally created/submitted the package (plain FK, no decorator — auth user).
  @Column({ type: 'int' })
  public created_by: number;

  // Publishing unit → ai_hub_publishers.id. Plain int with no FK/relation, matching category_id:
  // the write services validate the id exists, the read services resolve the name by batch join.
  // Package-scoped (not version-scoped) because ownership of an artifact does not change per version.
  @Column({ type: 'int' })
  public publisher_id: number;

  // JSON owning_unit_name (Trung tâm/phòng ban chủ quản). Optional freetext; khối chủ quản is publisher_id.
  @Column({ type: 'varchar', length: 500, nullable: true })
  public owning_unit_name: string | null;

  // Eager relation to the active version (read-only navigation property).
  // lazy import avoids circular dependency between PromptPackage ↔ PromptVersion.
  @OneToOne('PromptVersion', { nullable: true, eager: false })
  @JoinColumn({ name: 'active_version_id' })
  public active_version: PromptVersion | null;
}
