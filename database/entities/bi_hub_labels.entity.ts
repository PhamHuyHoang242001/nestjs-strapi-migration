import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BiHubLabelsBiHubReports } from './bi_hub_labels_bi_hub_reports.entity';
import { Admins } from './admins.entity';
import { BiHubLabelsFeedbackUsers } from './bi_hub_labels_feedback_users.entity';
import { BiHubHistoryReportsBiHubLabels } from './bi_hub_history_reports_bi_hub_labels.entity';
import { BiDiagnosticReportsBiHubLabels } from './bi_diagnostic_reports_bi_hub_labels.entity';

export enum BiHubLabelsLabelStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('bi_hub_labels')
export class BiHubLabels {
  @PrimaryGeneratedColumn()
  id: number;
  @OneToMany(() => BiHubLabelsBiHubReports, (p) => p.bi_hub_labels)
  bi_hub_reports_links?: BiHubLabelsBiHubReports[];
  @Column({ type: 'varchar', nullable: false })
  name?: string;
  @Column({ type: 'enum', enum: BiHubLabelsLabelStatusEnum, nullable: true })
  label_status?: BiHubLabelsLabelStatusEnum;
  @Column({ nullable: true })
  admin_id?: number;
  @ManyToOne(() => Admins)
  @JoinColumn({ name: 'admin_id' })
  admin?: Admins;
  @OneToMany(() => BiHubLabelsFeedbackUsers, (p) => p.bi_hub_labels)
  users_links?: BiHubLabelsFeedbackUsers[];
  @OneToMany(() => BiHubHistoryReportsBiHubLabels, (p) => p.bi_hub_labels)
  bi_hub_history_reports_links?: BiHubHistoryReportsBiHubLabels[];
  @OneToMany(() => BiDiagnosticReportsBiHubLabels, (p) => p.bi_hub_labels)
  diagnostic_reports_links?: BiDiagnosticReportsBiHubLabels[];
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