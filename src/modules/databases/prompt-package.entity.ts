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

  // User who originally created/submitted the package (plain FK, no decorator — auth user).
  @Column({ type: 'int' })
  public created_by: number;

  // Eager relation to the active version (read-only navigation property).
  // lazy import avoids circular dependency between PromptPackage ↔ PromptVersion.
  @OneToOne('PromptVersion', { nullable: true, eager: false })
  @JoinColumn({ name: 'active_version_id' })
  public active_version: PromptVersion | null;
}
