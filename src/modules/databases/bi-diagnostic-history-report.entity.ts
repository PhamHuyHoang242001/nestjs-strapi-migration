import { BaseAuthorAdminSoftDeleteColumn } from '@configuration/base-entity';
import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BIHubDiagnosticReport } from './bi-diagnostic-report.entity';
import { Users } from './user.entity';

@Entity('bi_hub_diagnostic_history_reports')
export class BIHubDiagnosticHistoryReport extends BaseAuthorAdminSoftDeleteColumn {
  @Column({ type: 'varchar', nullable: true })
  name: string;

  @Column({ type: 'json', nullable: true })
  change_log: any;

  @Column({ type: 'int', nullable: true, default: 0 })
  version: number;

  @Column({ type: 'int', nullable: true })
  diagnostic_files_id: number;

  @Column({ type: 'varchar', nullable: true })
  diagnostic_files_name: string;

  @Column({ type: 'varchar', nullable: true })
  diagnostic_files_url: string;

  @Column({ type: 'varchar', nullable: true })
  diagnostic_files_type: string;

  @Column({ nullable: true })
  bi_hub_diagnostic_report_id: number;
  @ManyToOne(() => BIHubDiagnosticReport, (r) => r.bi_hub_diagnostic_history_reports)
  @JoinColumn({ name: 'bi_hub_diagnostic_report_id' })
  bi_hub_diagnostic_report: BIHubDiagnosticReport;

  @Column({ type: 'boolean', nullable: true, default: false })
  is_change_link: boolean;

  @Column({ type: 'varchar', nullable: true })
  code: string;

  @ManyToOne(() => Users)
  @JoinColumn({ name: 'created_by_admin_id' })
  created_by_admin: Users;
}
