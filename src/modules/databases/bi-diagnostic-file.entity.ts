import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BiDiagnosticReport } from './bi-diagnostic-report.entity';

// File attachment for a BI Diagnostic report
@Entity('bi_diagnostic_files')
export class BiDiagnosticFile extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public file_name: string;

  @Column({ nullable: true })
  public file_url: string;

  // FK to bi_diagnostic_reports
  @Column({ type: 'int', nullable: false })
  public diagnostic_report_id: number;

  @ManyToOne(() => BiDiagnosticReport, (r) => r.files)
  @JoinColumn({ name: 'diagnostic_report_id' })
  public diagnostic_report: BiDiagnosticReport;
}
