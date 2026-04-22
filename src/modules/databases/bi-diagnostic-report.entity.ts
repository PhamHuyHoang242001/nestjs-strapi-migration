import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany } from 'typeorm';
import { BiDiagnosticCategory } from './bi-diagnostic-category.entity';
import { BiDiagnosticFile } from './bi-diagnostic-file.entity';
import { BiDiagnosticHistoryReport } from './bi-diagnostic-history-report.entity';
import { BiDiagnosticScope } from './bi-diagnostic-scope.entity';
import { BiHubCenter } from './bi-hub-center.entity';
import { BiHubDepartment } from './bi-hub-department.entity';
import { BiHubDivision } from './bi-hub-division.entity';
import { BiHubLabel } from './bi-hub-label.entity';

// BI Diagnostic report — owns M:N junction tables for categories and scopes
@Entity('bi_diagnostic_reports')
export class BiDiagnosticReport extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;

  @Column({ type: 'text', nullable: true })
  public key_insights: string;

  @Column({ type: 'boolean', nullable: true, default: false })
  public is_sensitive: boolean;

  @Column({ nullable: true })
  public bu_name: string;

  @Column({ type: 'int', nullable: true })
  public version: number;

  @Column({ type: 'int', nullable: true, default: 0 })
  public total_view: number;

  @Column({ type: 'text', nullable: true })
  public txt_diagnostic_scope: string;

  @Column({ type: 'text', nullable: true })
  public summary: string;

  @Column({ type: 'jsonb', nullable: true })
  public insight: Record<string, any>;

  @Column({ nullable: true })
  public code: string;

  // Strapi media field (icon) stored as flat columns
  @Column({ nullable: true })
  public icon_url: string;

  @Column({ nullable: true })
  public icon_name: string;

  @Column({ nullable: true })
  public icon_mime: string;

  @Column({ type: 'int', nullable: true })
  public icon_size: number;

  // N:1 org hierarchy FKs
  @Column({ type: 'int', nullable: true })
  public division_id: number;

  @ManyToOne(() => BiHubDivision)
  @JoinColumn({ name: 'division_id' })
  public division: BiHubDivision;

  @Column({ type: 'int', nullable: true })
  public center_id: number;

  @ManyToOne(() => BiHubCenter)
  @JoinColumn({ name: 'center_id' })
  public center: BiHubCenter;

  @Column({ type: 'int', nullable: true })
  public department_id: number;

  @ManyToOne(() => BiHubDepartment)
  @JoinColumn({ name: 'department_id' })
  public department: BiHubDepartment;

  @Column({ type: 'int', nullable: true })
  public bi_diagnostic_category_id: number;

  @ManyToOne(() => BiDiagnosticCategory)
  @JoinColumn({ name: 'bi_diagnostic_category_id' })
  public bi_diagnostic_category: BiDiagnosticCategory;

  // M:N relations — this entity owns all junction tables
  @ManyToMany(() => BiDiagnosticScope)
  @JoinTable({ name: 'bi_diagnostic_reports_scopes' })
  public scopes: BiDiagnosticScope[];

  @ManyToMany(() => BiHubLabel)
  @JoinTable({ name: 'bi_diagnostic_reports_labels' })
  public labels: BiHubLabel[];

  // 1:N child relations
  @OneToMany(() => BiDiagnosticFile, (f) => f.diagnostic_report)
  public files: BiDiagnosticFile[];

  @OneToMany(() => BiDiagnosticHistoryReport, (h) => h.diagnostic_report)
  public history_reports: BiDiagnosticHistoryReport[];
}
