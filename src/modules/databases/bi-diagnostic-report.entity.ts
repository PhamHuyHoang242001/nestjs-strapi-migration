import { Entity, Column, OneToMany, ManyToMany, JoinTable, ManyToOne, JoinColumn } from 'typeorm';
import { BaseAuthorAdminSoftDeleteColumn } from '@configuration/base-entity/base-author-admin-soft-delete-column.entity';
import { BiHubLabel } from './bi-hub-label.entity';
import { BiHubDiagnosticFile } from './bi-diagnostic-file.entity';
import { BIHubDiagnosticHistoryReport } from './bi-diagnostic-history-report.entity';
import { BiHubBiccDepartment } from './bi-hub-bicc-department.entity';
export const DIAGNOSTIC_REPORT_PIC = 'diagnostic_reports_pics';
export const DIAGNOSTIC_REPORT_SUPPORTER = 'diagnostic_reports_supporters';
export const DIAGNOSTIC_REPORT_LABEL = 'diagnostic_reports_labels';
export enum BIHubDiagnosticReportStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('bi_hub_diagnostic_reports')
export class BIHubDiagnosticReport extends BaseAuthorAdminSoftDeleteColumn {
  @Column({ nullable: true })
  bicc_department_id: number;
  @ManyToOne(() => BiHubBiccDepartment)
  @JoinColumn({ name: 'bicc_department_id' })
  bicc_department: BiHubBiccDepartment;

  @Column({ type: 'varchar', nullable: true })
  name: string;

  @Column({ type: 'boolean', nullable: true })
  is_sensitive: boolean;

  @ManyToMany(() => BiHubLabel)
  @JoinTable({
    name: DIAGNOSTIC_REPORT_LABEL,
    joinColumn: {
      name: 'diagnostic_report_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'label_id',
      referencedColumnName: 'id',
    },
  })
  labels: BiHubLabel[];

  @OneToMany(() => BiHubDiagnosticFile, (f) => f.bi_hub_diagnostic_report)
  bi_hub_diagnostic_files: BiHubDiagnosticFile[];

  @Column({ type: 'enum', enum: BIHubDiagnosticReportStatus, nullable: true })
  status: BIHubDiagnosticReportStatus;

  @Column({ type: 'varchar', nullable: true })
  icon: string;

  @Column({ type: 'varchar', nullable: true })
  bu_name: string;

  @Column({ type: 'boolean', nullable: true })
  is_deleted: boolean;

  @Column({ type: 'int', nullable: true, default: 0 })
  version: number;

  @OneToMany(() => BIHubDiagnosticHistoryReport, (h) => h.bi_hub_diagnostic_report)
  bi_hub_diagnostic_history_reports: BIHubDiagnosticHistoryReport[];

  @Column({ type: 'boolean', nullable: true, default: false })
  is_change_link: boolean;

  @Column({ type: 'int', nullable: true, default: 0 })
  total_view: number;

  @Column({ type: 'text', nullable: true })
  txt_diagnostic_scope: string;

  @Column({ type: 'text', nullable: true })
  summary: string;

  @Column({ type: 'simple-json', nullable: true })
  insight: string[];

  @Column({ type: 'varchar', nullable: true })
  code: string;
}
