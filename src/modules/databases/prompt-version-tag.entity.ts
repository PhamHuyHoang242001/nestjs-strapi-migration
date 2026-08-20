import { Column, Entity, Index } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

// Join between a prompt version and a catalog tag. Replaces the freeform jsonb tag array:
// tags are now selected from ai_hub_tags, so filtering can join on ids instead of matching
// text. Relation-free (plain ints) — the read services batch-load tag rows by version_id.
@Entity('prompt_version_tags')
@Index(['prompt_version_id'])
@Index(['tag_id'])
export class PromptVersionTag extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public prompt_version_id: number;

  @Column({ type: 'int' })
  public tag_id: number;
}
