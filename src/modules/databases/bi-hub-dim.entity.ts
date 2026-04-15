import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// BI Hub dimension lookup entity — linked to reports via bi_hub_reports_dims
@Entity('bi_hub_dims')
export class BiHubDim extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;

  @Column({ nullable: true })
  public code: string;
}
