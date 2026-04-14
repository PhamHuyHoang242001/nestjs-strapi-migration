import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { AdminsBiHubReports } from './admins_bi_hub_reports.entity';
import { AdminsBiHubHistoryReports } from './admins_bi_hub_history_reports.entity';
import { AdminsBiDiagnosticReports } from './admins_bi_diagnostic_reports.entity';
import { AdminsMaToolWorkspaces } from './admins_ma_tool_workspaces.entity';
import { AdminsBiPaymentProjects } from './admins_bi_payment_projects.entity';

export enum AdminsLanguageEnum {
  VI = 'vi',
  EN = 'en',
}

@Entity('admins')
export class Admins {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  admin_id?: number;
  @ManyToOne(() => Admins)
  @JoinColumn({ name: 'admin_id' })
  admin?: Admins;
  @OneToMany(() => AdminsBiHubReports, (p) => p.admins)
  bi_hub_reports_links?: AdminsBiHubReports[];
  // OneToMany inverse: bi_hub_labels -> BiHubLabels
  @OneToMany(() => AdminsBiHubHistoryReports, (p) => p.admins)
  bi_hub_history_reports_links?: AdminsBiHubHistoryReports[];
  @OneToMany(() => AdminsBiHubReports, (p) => p.admins)
  bi_hub_report_pic_links?: AdminsBiHubReports[];
  @OneToMany(() => AdminsBiHubHistoryReports, (p) => p.admins)
  bi_hub_history_reports_pic_links?: AdminsBiHubHistoryReports[];
  @OneToMany(() => AdminsBiDiagnosticReports, (p) => p.admins)
  bi_diagnostic_reports_links?: AdminsBiDiagnosticReports[];
  @OneToMany(() => AdminsBiDiagnosticReports, (p) => p.admins)
  diagnostic_reports_links?: AdminsBiDiagnosticReports[];
  @OneToMany(() => AdminsMaToolWorkspaces, (p) => p.admins)
  ma_tool_workspaces_links?: AdminsMaToolWorkspaces[];
  @OneToMany(() => AdminsBiPaymentProjects, (p) => p.admins)
  bi_payment_projects_links?: AdminsBiPaymentProjects[];
  @Column({ type: 'enum', enum: AdminsLanguageEnum, nullable: true })
  language?: AdminsLanguageEnum;
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