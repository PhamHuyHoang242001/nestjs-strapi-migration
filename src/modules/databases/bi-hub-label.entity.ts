import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Label entity for BI Hub and BI Diagnostic reports
@Entity('bi_hub_labels')
export class BiHubLabel extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;
}
