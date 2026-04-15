import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BiHubReport } from './bi-hub-report.entity';

// User favourite bookmark for a BI Hub report
@Entity('bi_hub_favourites')
export class BiHubFavourite extends BaseSoftDeleteEntity {
  // Plain user FK — no relation decorator per project rules
  @Column({ type: 'int', nullable: true })
  public user_id: number;

  // FK to bi_hub_reports
  @Column({ type: 'int', nullable: false })
  public bi_hub_report_id: number;

  @ManyToOne(() => BiHubReport, (r) => r.favourites)
  @JoinColumn({ name: 'bi_hub_report_id' })
  public bi_hub_report: BiHubReport;
}
