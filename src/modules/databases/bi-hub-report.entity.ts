import {
  BiHubReportFrequency,
  BiHubReportProgressStatus,
  BiHubReportRegularType,
  BiHubReportStatus,
  BiHubReportStatusActive,
  BiHubReportType,
} from '@common/enums';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BiHubBiccDepartment } from './bi-hub-bicc-department.entity';
import { BiHubCenter } from './bi-hub-center.entity';
import { BiHubDepartment } from './bi-hub-department.entity';
import { BiHubDim } from './bi-hub-dim.entity';
import { BiHubDivision } from './bi-hub-division.entity';
import { BiHubFact } from './bi-hub-fact.entity';
import { BiHubFavourite } from './bi-hub-favourite.entity';
import { BiHubHistoryReport } from './bi-hub-history-report.entity';
import { BiHubLabel } from './bi-hub-label.entity';
import { BiHubRating } from './bi-hub-rating.entity';
import { BiHubReportComment } from './bi-hub-report-comment.entity';
import { BiHubReportFile } from './bi-hub-report-file.entity';
import { BiHubTag } from './bi-hub-tag.entity';

// Central BI Hub report entity — owns all M:N junction tables
@Entity('bi_hub_reports')
export class BiHubReport extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;

  @Column({ nullable: true })
  public code: string;

  @Column({ nullable: false })
  public requester: string;

  @Column({ type: 'timestamp', nullable: false })
  public order_date: Date;

  @Column({ type: 'timestamp', nullable: false })
  public sending_date: Date;

  @Column({ type: 'timestamp', nullable: false })
  public due_date: Date;

  @Column({
    type: 'enum',
    enum: BiHubReportProgressStatus,
    nullable: false,
    default: BiHubReportProgressStatus.INPROGRESS,
  })
  public progress_status: BiHubReportProgressStatus;

  @Column({
    type: 'enum',
    enum: BiHubReportFrequency,
    nullable: true,
    default: BiHubReportFrequency.DAILY,
  })
  public frequency_order_date: BiHubReportFrequency;

  @Column({
    type: 'enum',
    enum: BiHubReportStatus,
    nullable: false,
    default: BiHubReportStatus.ONGOING,
  })
  public report_status: BiHubReportStatus;

  @Column({ type: 'boolean', nullable: false, default: false })
  public is_sensitive: boolean;

  @Column({ type: 'text', nullable: true })
  public description: string;

  @Column({ nullable: true })
  public bu_name: string;

  @Column({ type: 'int', nullable: true })
  public version: number;

  @Column({ type: 'boolean', nullable: true, default: false })
  public is_change_link: boolean;

  @Column({ type: 'decimal', nullable: true, default: 0 })
  public average_ratings: number;

  @Column({ type: 'timestamp', nullable: true })
  public ending_date: Date;

  @Column({ type: 'int', nullable: true, default: 0 })
  public total_view: number;

  @Column({ nullable: true })
  public original_report_id: number;

  @Column({ type: 'enum', enum: BiHubReportType, nullable: false })
  public report_type: BiHubReportType;

  @Column({ type: 'enum', enum: BiHubReportRegularType, nullable: true })
  public regular_type: BiHubReportRegularType;

  @Column({
    type: 'enum',
    enum: BiHubReportStatusActive,
    nullable: false,
    default: BiHubReportStatusActive.ACTIVE,
  })
  public report_status_active: BiHubReportStatusActive;

  @Column({ type: 'boolean', nullable: true, default: true })
  public is_origin: boolean;

  @Column({ type: 'text', nullable: true })
  public txt_dim: string;

  @Column({ type: 'text', nullable: true })
  public txt_fact: string;

  // N:1 org hierarchy — FK columns on this side
  @Column({ type: 'int', nullable: true })
  public bicc_department_id: number;

  @ManyToOne(() => BiHubBiccDepartment)
  @JoinColumn({ name: 'bicc_department_id' })
  public bicc_department: BiHubBiccDepartment;

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

  // M:N relations — this entity owns all junction tables
  @ManyToMany(() => BiHubTag)
  @JoinTable({ name: 'bi_hub_reports_tags' })
  public tags: BiHubTag[];

  @ManyToMany(() => BiHubLabel)
  @JoinTable({ name: 'bi_hub_reports_labels' })
  public labels: BiHubLabel[];

  @ManyToMany(() => BiHubBiccDepartment)
  @JoinTable({ name: 'bi_hub_reports_bicc_departments' })
  public bicc_departments: BiHubBiccDepartment[];

  @ManyToMany(() => BiHubDivision)
  @JoinTable({ name: 'bi_hub_reports_divisions' })
  public divisions: BiHubDivision[];

  @ManyToMany(() => BiHubCenter)
  @JoinTable({ name: 'bi_hub_reports_centers' })
  public centers: BiHubCenter[];

  @ManyToMany(() => BiHubDepartment)
  @JoinTable({ name: 'bi_hub_reports_departments' })
  public departments: BiHubDepartment[];

  @ManyToMany(() => BiHubDim)
  @JoinTable({ name: 'bi_hub_reports_dims' })
  public dims: BiHubDim[];

  @ManyToMany(() => BiHubFact)
  @JoinTable({ name: 'bi_hub_reports_facts' })
  public facts: BiHubFact[];

  // 1:N child relations
  @OneToMany(() => BiHubReportComment, (c) => c.bi_hub_report)
  public comments: BiHubReportComment[];

  @OneToMany(() => BiHubReportFile, (f) => f.bi_hub_report)
  public files: BiHubReportFile[];

  @OneToMany(() => BiHubRating, (r) => r.bi_hub_report)
  public ratings: BiHubRating[];

  @OneToMany(() => BiHubFavourite, (f) => f.bi_hub_report)
  public favourites: BiHubFavourite[];

  @OneToMany(() => BiHubHistoryReport, (h) => h.report)
  public history_reports: BiHubHistoryReport[];
}
