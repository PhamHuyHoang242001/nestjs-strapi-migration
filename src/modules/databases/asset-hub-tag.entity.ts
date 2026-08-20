import { IsEnum, IsString } from 'class-validator';
import { Column, Entity, Index } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

// Ownership axis of a tag: an enterprise-wide artifact vs a personally maintained one.
export enum AssetHubTagKind {
  ENTERPRISE = 'enterprise',
  PERSONAL = 'personal',
}

// Which asset-hub workspace a tag belongs to. A tag is never shared across workspaces,
// so the create/bump path rejects a tag whose artifact_type differs from the target item.
export enum AssetHubTagArtifactType {
  SKILL = 'skill',
  PROMPT = 'prompt',
}

// Seeded catalog of selectable tags. Deliberately has no is_active flag (unlike ai_hub_categories):
// retirement is expressed by soft delete, since there is no admin CRUD surface this round.
@Entity('ai_hub_tags')
@Index(['artifact_type'])
@Index(['kind'])
export class AssetHubTag extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar', length: 200 })
  @IsString()
  public name: string;

  @Column({ type: 'varchar', length: 20 })
  @IsEnum(AssetHubTagKind)
  public kind: AssetHubTagKind;

  @Column({ type: 'varchar', length: 20 })
  @IsEnum(AssetHubTagArtifactType)
  public artifact_type: AssetHubTagArtifactType;
}
