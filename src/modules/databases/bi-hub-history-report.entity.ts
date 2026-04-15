import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BiHubReport } from './bi-hub-report.entity';

// Audit history snapshot of a BI Hub report — tracks CRUD actions
@Entity('bi_hub_history_reports')
export class BiHubHistoryReport extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public action: string;

  @Column({ nullable: true })
  public action_by: string;

  @Column({ type: 'timestamp', nullable: true })
  public action_at: Date;

  // FK to bi_hub_reports
  @Column({ type: 'int', nullable: false })
  public report_id: number;

  @ManyToOne(() => BiHubReport, (r) => r.history_reports)
  @JoinColumn({ name: 'report_id' })
  public report: BiHubReport;
}
