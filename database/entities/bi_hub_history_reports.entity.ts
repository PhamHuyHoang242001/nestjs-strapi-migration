import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BiHubHistoryReportsBiHubLabels } from './bi_hub_history_reports_bi_hub_labels.entity';
import { AdminsBiHubHistoryReports } from './admins_bi_hub_history_reports.entity';
import { BiHubReports } from './bi_hub_reports.entity';
import { Admins } from './admins.entity';

export enum BiHubHistoryReportsReportTypeEnum {
  ADHOC = 'adhoc',
  REGULAR = 'regular',
}

export enum BiHubHistoryReportsProgressStatusEnum {
  INPROGRESS = 'inprogress',
  COMPLETED = 'completed',
  OVERDUE = 'overdue',
}

export enum BiHubHistoryReportsFrequencyOrderDateEnum {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  BI_WEEKLY = 'bi_weekly',
  MONTHLY = 'monthly',
  QUATERLY = 'quaterly',
  SEMI_ANNUAL = 'semi_annual',
  YEARLY = 'yearly',
}

export enum BiHubHistoryReportsReportStatusEnum {
  ONGOING = 'ongoing',
  CLOSED = 'closed',
}

export enum BiHubHistoryReportsRegularTypeEnum {
  AUTO = 'auto',
  MANUAL = 'manual',
}

export enum BiHubHistoryReportsReportStatusActiveEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum BiHubHistoryReportsHistoryReportStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('bi_hub_history_reports')
export class BiHubHistoryReports {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'int', nullable: true })
  bicc_department_id?: number;
  @Column({ type: 'varchar', nullable: true })
  bicc_department_name?: string;
  @Column({ type: 'varchar', nullable: true })
  bicc_department_code?: string;
  @Column({ type: 'int', nullable: true })
  division_id?: number;
  @Column({ type: 'varchar', nullable: true })
  division_name?: string;
  @Column({ type: 'int', nullable: true })
  center_id?: number;
  @Column({ type: 'varchar', nullable: true })
  center_name?: string;
  @Column({ type: 'int', nullable: true })
  department_id?: number;
  @Column({ type: 'varchar', nullable: true })
  department_name?: string;
  @Column({ type: 'enum', enum: BiHubHistoryReportsReportTypeEnum, nullable: false })
  report_type?: BiHubHistoryReportsReportTypeEnum;
  @Column({ type: 'varchar', nullable: false })
  name?: string;
  @Column({ type: 'varchar', nullable: true })
  code?: string;
  @Column({ type: 'varchar', nullable: false })
  requester?: string;
  @Column({ type: 'timestamp', nullable: false })
  order_date?: string;
  @Column({ type: 'timestamp', nullable: false })
  sending_date?: string;
  @Column({ type: 'enum', enum: BiHubHistoryReportsProgressStatusEnum, nullable: false })
  progress_status?: BiHubHistoryReportsProgressStatusEnum;
  @Column({ type: 'int', nullable: true })
  total_view?: number;
  @Column({ type: 'enum', enum: BiHubHistoryReportsFrequencyOrderDateEnum, nullable: true })
  frequency_order_date?: BiHubHistoryReportsFrequencyOrderDateEnum;
  @Column({ type: 'enum', enum: BiHubHistoryReportsReportStatusEnum, nullable: true })
  report_status?: BiHubHistoryReportsReportStatusEnum;
  @Column({ type: 'boolean', nullable: true })
  is_origin?: boolean;
  @Column({ type: 'timestamp', nullable: false })
  due_date?: string;
  @Column({ type: 'varchar', nullable: true })
  bu_name?: string;
  @Column({ type: 'enum', enum: BiHubHistoryReportsRegularTypeEnum, nullable: true })
  regular_type?: BiHubHistoryReportsRegularTypeEnum;
  @Column({ type: 'enum', enum: BiHubHistoryReportsReportStatusActiveEnum, nullable: true })
  report_status_active?: BiHubHistoryReportsReportStatusActiveEnum;
  @Column({ type: 'varchar', nullable: true })
  description?: string;
  @Column({ type: 'varchar', nullable: true })
  dim?: string;
  @Column({ type: 'varchar', nullable: true })
  fact?: string;
  @Column({ type: 'float', nullable: true })
  average_ratings?: number;
  @Column({ type: 'timestamp', nullable: true })
  ending_date?: string;
  @Column({ type: 'boolean', nullable: false })
  is_sensitive?: boolean;
  @Column({ type: 'int', nullable: true })
  original_report_id?: number;
  // OneToMany inverse: comments -> BiHubReportComments
  // OneToMany inverse: tags -> BiHubTags
  @OneToMany(() => BiHubHistoryReportsBiHubLabels, (p) => p.bi_hub_history_reports)
  labels_links?: BiHubHistoryReportsBiHubLabels[];
  // OneToMany inverse: ratings -> BiHubRatings
  // OneToMany inverse: favourite -> BiHubFavourites
  @OneToMany(() => AdminsBiHubHistoryReports, (p) => p.bi_hub_history_reports)
  admins_links?: AdminsBiHubHistoryReports[];
  @Column({ nullable: true })
  report_id?: number;
  @ManyToOne(() => BiHubReports)
  @JoinColumn({ name: 'report_id' })
  report?: BiHubReports;
  @Column({ type: 'int', nullable: true })
  report_files_id?: number;
  @Column({ type: 'varchar', nullable: true })
  report_files_name?: string;
  @Column({ type: 'varchar', nullable: true })
  report_files_url?: string;
  @Column({ type: 'varchar', nullable: true })
  report_files_type?: string;
  @Column({ type: 'enum', enum: BiHubHistoryReportsHistoryReportStatusEnum, nullable: true })
  history_report_status?: BiHubHistoryReportsHistoryReportStatusEnum;
  @Column({ type: 'boolean', nullable: true })
  is_deleted?: boolean;
  @Column({ type: 'int', nullable: true })
  version?: number;
  @Column({ type: 'simple-json', nullable: true })
  change_log?: string;
  @Column({ type: 'boolean', nullable: true })
  is_change_link?: boolean;
  @OneToMany(() => AdminsBiHubHistoryReports, (p) => p.bi_hub_history_reports)
  pic_links?: AdminsBiHubHistoryReports[];
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