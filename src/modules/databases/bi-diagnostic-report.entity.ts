import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany } from 'typeorm';
import { BiHubDiagnosticFile } from './bi-diagnostic-file.entity';
import { BIHubDiagnosticHistoryReport } from './bi-diagnostic-history-report.entity';
import { BiHubDiagnosticScope } from './bi-diagnostic-scope.entity';
import { BiHubBiccDepartment } from './bi-hub-bicc-department.entity';
import { BiHubCenter } from './bi-hub-center.entity';
import { BiHubDepartment } from './bi-hub-department.entity';
import { BiHubDivision } from './bi-hub-division.entity';
import { BiHubLabel } from './bi-hub-label.entity';

export enum BIHubDiagnosticReportStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

// BI Hub Diagnostic report — owns M:N junctions for scopes and labels
@Entity('bi_hub_diagnostic_reports')
export class BIHubDiagnosticReport extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  name: string;

  @Column({ type: 'text', nullable: true })
  key_insights: string;

  @Column({ type: 'boolean', nullable: true, default: false })
  is_sensitive: boolean;

  @Column({ nullable: true })
  bu_name: string;

  @Column({ type: 'int', nullable: true, default: 0 })
  version: number;

  @Column({ type: 'int', nullable: true, default: 0 })
  total_view: number;

  @Column({ type: 'text', nullable: true })
  txt_diagnostic_scope: string;

  @Column({ type: 'text', nullable: true })
  summary: string;

  @Column({ type: 'jsonb', nullable: true })
  insight: Record<string, any>;

  @Column({ nullable: true })
  code: string;

  @Column({ nullable: true })
  icon: string;

  @Column({ type: 'boolean', nullable: true, default: false })
  is_deleted: boolean;

  @Column({ type: 'boolean', nullable: true, default: false })
  is_change_link: boolean;

  @Column({ type: 'enum', enum: BIHubDiagnosticReportStatus, default: BIHubDiagnosticReportStatus.ACTIVE })
  diagnostic_report_status: BIHubDiagnosticReportStatus;

  // N:1 bicc-department — direct link (category layer removed)
  @Column({ type: 'int', nullable: true })
  bicc_department_id: number;

  @ManyToOne(() => BiHubBiccDepartment, (d) => d.diagnostic_reports)
  @JoinColumn({ name: 'bicc_department_id' })
  bicc_department: BiHubBiccDepartment;

  // N:1 org hierarchy FKs
  @Column({ type: 'int', nullable: true })
  division_id: number;

  @ManyToOne(() => BiHubDivision)
  @JoinColumn({ name: 'division_id' })
  division: BiHubDivision;

  @Column({ type: 'int', nullable: true })
  center_id: number;

  @ManyToOne(() => BiHubCenter)
  @JoinColumn({ name: 'center_id' })
  center: BiHubCenter;

  @Column({ type: 'int', nullable: true })
  department_id: number;

  @ManyToOne(() => BiHubDepartment)
  @JoinColumn({ name: 'department_id' })
  department: BiHubDepartment;

  // M:N relations — this entity owns all junction tables
  @ManyToMany(() => BiHubDiagnosticScope)
  @JoinTable({ name: 'bi_hub_diagnostic_reports_scopes' })
  scopes: BiHubDiagnosticScope[];

  @ManyToMany(() => BiHubLabel)
  @JoinTable({ name: 'bi_hub_diagnostic_reports_labels' })
  labels: BiHubLabel[];

  // 1:N child relations
  @OneToMany(() => BiHubDiagnosticFile, (f) => f.bi_hub_diagnostic_report)
  bi_hub_diagnostic_files: BiHubDiagnosticFile[];

  @OneToMany(() => BIHubDiagnosticHistoryReport, (h) => h.bi_hub_diagnostic_report)
  bi_hub_diagnostic_history_reports: BIHubDiagnosticHistoryReport[];
}
