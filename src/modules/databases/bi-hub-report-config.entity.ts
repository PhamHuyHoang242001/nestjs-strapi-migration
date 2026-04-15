import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Per-report configuration key-value store
@Entity('bi_hub_report_configs')
export class BiHubReportConfig extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public config_key: string;

  @Column({ type: 'jsonb', nullable: true })
  public config_value: Record<string, any>;
}
