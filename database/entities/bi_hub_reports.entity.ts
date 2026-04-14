import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BiHubBiccDepartments } from './bi_hub_bicc_departments.entity';
import { BiHubReportsBiHubTags } from './bi_hub_reports_bi_hub_tags.entity';
import { BiHubLabelsBiHubReports } from './bi_hub_labels_bi_hub_reports.entity';
import { AdminsBiHubReports } from './admins_bi_hub_reports.entity';
import { Admins } from './admins.entity';

export enum BiHubReportsReportTypeEnum {
  ADHOC = 'adhoc',
  REGULAR = 'regular',
}

export enum BiHubReportsProgressStatusEnum {
  INPROGRESS = 'inprogress',
  COMPLETED = 'completed',
  OVERDUE = 'overdue',
}

export enum BiHubReportsFrequencyOrderDateEnum {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  BI_WEEKLY = 'bi_weekly',
  MONTHLY = 'monthly',
  QUATERLY = 'quaterly',
  SEMI_ANNUAL = 'semi_annual',
  YEARLY = 'yearly',
}

export enum BiHubReportsReportStatusEnum {
  ONGOING = 'ongoing',
  CLOSED = 'closed',
}

export enum BiHubReportsRegularTypeEnum {
  AUTO = 'auto',
  MANUAL = 'manual',
}

export enum BiHubReportsReportStatusActiveEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('bi_hub_reports')
export class BiHubReports {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  bicc_department_id?: number;
  @ManyToOne(() => BiHubBiccDepartments)
  @JoinColumn({ name: 'bicc_department_id' })
  bicc_department?: BiHubBiccDepartments;
  // OneToMany inverse: comments -> BiHubReportComments
  @OneToMany(() => BiHubReportsBiHubTags, (p) => p.bi_hub_reports)
  tags_links?: BiHubReportsBiHubTags[];
  @OneToMany(() => BiHubLabelsBiHubReports, (p) => p.bi_hub_reports)
  labels_links?: BiHubLabelsBiHubReports[];
  // OneToMany inverse: ratings -> BiHubRatings
  // OneToMany inverse: favourites -> BiHubFavourites
  @Column({ type: 'enum', enum: BiHubReportsReportTypeEnum, nullable: false })
  report_type?: BiHubReportsReportTypeEnum;
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
  @Column({ type: 'enum', enum: BiHubReportsProgressStatusEnum, nullable: false })
  progress_status?: BiHubReportsProgressStatusEnum;
  @Column({ type: 'int', nullable: true })
  total_view?: number;
  @Column({ type: 'enum', enum: BiHubReportsFrequencyOrderDateEnum, nullable: true })
  frequency_order_date?: BiHubReportsFrequencyOrderDateEnum;
  @Column({ type: 'enum', enum: BiHubReportsReportStatusEnum, nullable: true })
  report_status?: BiHubReportsReportStatusEnum;
  @Column({ type: 'boolean', nullable: true })
  is_origin?: boolean;
  @Column({ type: 'timestamp', nullable: false })
  due_date?: string;
  @Column({ type: 'varchar', nullable: true })
  bu_name?: string;
  @Column({ type: 'enum', enum: BiHubReportsRegularTypeEnum, nullable: true })
  regular_type?: BiHubReportsRegularTypeEnum;
  @Column({ type: 'enum', enum: BiHubReportsReportStatusActiveEnum, nullable: true })
  report_status_active?: BiHubReportsReportStatusActiveEnum;
  @OneToMany(() => AdminsBiHubReports, (p) => p.bi_hub_reports)
  admins_links?: AdminsBiHubReports[];
  @Column({ type: 'varchar', nullable: true })
  description?: string;
  @OneToMany(() => AdminsBiHubReports, (p) => p.bi_hub_reports)
  pic_links?: AdminsBiHubReports[];
  @Column({ type: 'float', nullable: true })
  average_ratings?: number;
  @Column({ type: 'timestamp', nullable: true })
  ending_date?: string;
  @Column({ type: 'boolean', nullable: false })
  is_sensitive?: boolean;
  @Column({ type: 'int', nullable: true })
  original_report_id?: number;
  // OneToMany inverse: report_files -> BiHubReportFiles
  // OneToMany inverse: history_reports -> BiHubHistoryReports
  @Column({ type: 'boolean', nullable: true })
  is_deleted?: boolean;
  @Column({ type: 'int', nullable: true })
  version?: number;
  @Column({ type: 'boolean', nullable: true })
  is_change_link?: boolean;
  @Column({ type: 'text', nullable: true })
  txt_dim?: string;
  @Column({ type: 'text', nullable: true })
  txt_fact?: string;
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