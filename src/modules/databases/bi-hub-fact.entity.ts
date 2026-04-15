import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// BI Hub fact/metric lookup entity — linked to reports via bi_hub_reports_facts
@Entity('bi_hub_facts')
export class BiHubFact extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;

  @Column({ nullable: true })
  public code: string;
}
