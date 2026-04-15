import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BiDiagnosticReport } from './bi-diagnostic-report.entity';

// Audit history snapshot of a BI Diagnostic report — tracks CRUD actions
@Entity('bi_diagnostic_history_reports')
export class BiDiagnosticHistoryReport extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public action: string;

  @Column({ nullable: true })
  public action_by: string;

  @Column({ type: 'timestamp', nullable: true })
  public action_at: Date;

  // FK to bi_diagnostic_reports
  @Column({ type: 'int', nullable: false })
  public diagnostic_report_id: number;

  @ManyToOne(() => BiDiagnosticReport, (r) => r.history_reports)
  @JoinColumn({ name: 'diagnostic_report_id' })
  public diagnostic_report: BiDiagnosticReport;
}
