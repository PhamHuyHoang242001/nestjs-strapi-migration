import { BiHubTagStatus, BiHubTagType } from '@common/enums';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Tagging entity for BI Hub reports
@Entity('bi_hub_tags')
export class BiHubTag extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;

  @Column({ type: 'enum', enum: BiHubTagType, nullable: true })
  public type: BiHubTagType;

  @Column({ type: 'enum', enum: BiHubTagStatus, nullable: true })
  public tag_status: BiHubTagStatus;
}
