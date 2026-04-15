import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Org hierarchy: center level
@Entity('bi_hub_centers')
export class BiHubCenter extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;

  @Column({ nullable: true })
  public code: string;

  @Column({ nullable: true })
  public is_deleted: boolean;
}
