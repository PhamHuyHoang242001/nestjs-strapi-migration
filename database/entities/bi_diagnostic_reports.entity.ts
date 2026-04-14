import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { AdminsBiDiagnosticReports } from './admins_bi_diagnostic_reports.entity';
import { BiDiagnosticCategories } from './bi_diagnostic_categories.entity';
import { BiDiagnosticReportsBiHubLabels } from './bi_diagnostic_reports_bi_hub_labels.entity';
import { Admins } from './admins.entity';

export enum BiDiagnosticReportsDiagnosticReportStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('bi_diagnostic_reports')
export class BiDiagnosticReports {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  name?: string;
  @Column({ type: 'text', nullable: true })
  key_insights?: string;
  @OneToMany(() => AdminsBiDiagnosticReports, (p) => p.bi_diagnostic_reports)
  pic_links?: AdminsBiDiagnosticReports[];
  @Column({ nullable: true })
  bi_diagnostic_category_id?: number;
  @ManyToOne(() => BiDiagnosticCategories)
  @JoinColumn({ name: 'bi_diagnostic_category_id' })
  bi_diagnostic_category?: BiDiagnosticCategories;
  @Column({ type: 'boolean', nullable: true })
  is_sensitive?: boolean;
  @OneToMany(() => AdminsBiDiagnosticReports, (p) => p.bi_diagnostic_reports)
  supporter_links?: AdminsBiDiagnosticReports[];
  @OneToMany(() => BiDiagnosticReportsBiHubLabels, (p) => p.bi_diagnostic_reports)
  labels_links?: BiDiagnosticReportsBiHubLabels[];
  // OneToMany inverse: files -> BiDiagnosticFiles
  @Column({ type: 'enum', enum: BiDiagnosticReportsDiagnosticReportStatusEnum, nullable: true })
  diagnostic_report_status?: BiDiagnosticReportsDiagnosticReportStatusEnum;
  @Column({ type: 'varchar', nullable: true })
  icon?: string;
  @Column({ type: 'varchar', nullable: true })
  bu_name?: string;
  @Column({ type: 'boolean', nullable: true })
  is_deleted?: boolean;
  @Column({ type: 'int', nullable: true })
  version?: number;
  // OneToMany inverse: bi_diagnostic_history_reports -> BiDiagnosticHistoryReports
  @Column({ type: 'boolean', nullable: true })
  is_change_link?: boolean;
  @Column({ type: 'int', nullable: true })
  total_view?: number;
  @Column({ type: 'text', nullable: false })
  txt_diagnostic_scope?: string;
  @Column({ type: 'text', nullable: true })
  summary?: string;
  @Column({ type: 'simple-json', nullable: true })
  insight?: string;
  @Column({ type: 'varchar', nullable: true })
  code?: string;
  @Column({ nullable: true })
  created_by?: number;
  @ManyToOne(() => Admins)
  @JoinColumn({ name: 'created_by' })
  created_by_admin?: Admins;
  @Column({ nullable: true })
  updated_by?: number;
  @ManyToOne(() => Admins)
  @JoinColumn({ name: 'updated_by' })
  updated_by_admin?: Admins;
}