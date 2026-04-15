import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Org hierarchy: BICC department level
@Entity('bi_hub_bicc_departments')
export class BiHubBiccDepartment extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;

  @Column({ nullable: true })
  public code: string;

  @Column({ nullable: true })
  public is_deleted: boolean;
}
