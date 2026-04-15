import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Org hierarchy: division level
@Entity('bi_hub_divisions')
export class BiHubDivision extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;

  @Column({ nullable: true })
  public code: string;

  @Column({ nullable: true })
  public is_deleted: boolean;
}
