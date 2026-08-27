import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { PromptPackage } from './prompt-package.entity';
import { AssetHubTagKind } from './asset-hub-tag.entity';

// Lifecycle: pending → approved | rejected. No 'archived' state; liveness is determined
// by prompt_packages.active_version_id pointing to this row.
export enum PromptVersionState {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('prompt_versions')
export class PromptVersion extends BaseSoftDeleteEntity {
  // FK → prompt_packages ON DELETE RESTRICT — prevents orphaned versions;
  // caller must archive/delete versions before deleting a package.
  @Column({ type: 'int' })
  public prompt_package_id: number;

  @ManyToOne(() => PromptPackage, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'prompt_package_id' })
  public prompt_package: PromptPackage;

  // Monotonic counter assigned at submit time (not approve time). Enforced unique per package
  // via DB constraint; application computes max+1 inside the pending-guard transaction so a
  // 23505 violation maps to a 409 response.
  @Column({ type: 'int' })
  public version_no: number;

  // Predecessor approved version_no this row builds on (NULL for the first-ever version).
  // Numbering mechanic: an update sets old_version = latest approved non-deleted version_no and
  // version_no = old_version (a placeholder sharing the live number); approve finalizes
  // version_no = (old_version ?? 0) + 1. A pending row with old_version IS NULL is the "mới" signal.
  // version_no stays NOT NULL; only this predecessor label is nullable.
  @Column({ type: 'int', nullable: true })
  public old_version: number | null;

  @Column({ type: 'varchar', default: PromptVersionState.PENDING })
  public state: PromptVersionState;

  @Column({ type: 'varchar' })
  public name: string;

  @Column({ type: 'text' })
  public short_description: string;

  @Column({ type: 'int', nullable: true })
  public category_id: number | null;

  // Tags live in ai_hub_tags and are linked through prompt_version_tags — the read services batch
  // them onto the response. Deliberately not a TypeORM relation, matching category_id.

  // Rich-text usage guide (sanitized HTML from the editor). Version-scoped so a bump can
  // revise the instructions alongside the artifact, and so a reviewer diffs guide + content
  // together. Empty string means "no guide" — required on create, allowed empty on bump.
  @Column({ type: 'varchar', length: 20, default: AssetHubTagKind.PERSONAL })
  public kind: AssetHubTagKind;

  @Column({ type: 'text', default: '' })
  public usage_guide_html: string;

  // Strapi URL of the uploaded avatar image, stored directly (nullable, URL only — no metadata).
  // Served back to the client verbatim; origin is validated against the Strapi host at submit.
  @Column({ type: 'varchar', nullable: true })
  public avatar_url: string | null;

  // The prompt text artifact — sent verbatim in the JSON body (no ZIP, no Strapi fetch).
  // This is the reviewable/diffable content of the version.
  @Column({ type: 'text' })
  public prompt_content: string;

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
