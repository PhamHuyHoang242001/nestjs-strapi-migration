import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BiHubReports } from './bi_hub_reports.entity';
import { FeedbackUsers } from './feedback_users.entity';
import { BiHubHistoryReports } from './bi_hub_history_reports.entity';
import { Admins } from './admins.entity';

export enum BiHubReportCommentsReportCommentStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('bi_hub_report_comments')
export class BiHubReportComments {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  bi_hub_reports_id?: number;
  @ManyToOne(() => BiHubReports)
  @JoinColumn({ name: 'bi_hub_reports_id' })
  bi_hub_reports?: BiHubReports;
  @Column({ nullable: true })
  user_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'user_id' })
  user?: FeedbackUsers;
  @Column({ type: 'varchar', nullable: true })
  content?: string;
  @Column({ type: 'enum', enum: BiHubReportCommentsReportCommentStatusEnum, nullable: true })
  report_comment_status?: BiHubReportCommentsReportCommentStatusEnum;
  @Column({ nullable: true })
  bi_hub_report_id?: number;
  @ManyToOne(() => BiHubReports)
  @JoinColumn({ name: 'bi_hub_report_id' })
  bi_hub_report?: BiHubReports;
  @Column({ nullable: true })
  bi_hub_history_report_id?: number;
  @ManyToOne(() => BiHubHistoryReports)
  @JoinColumn({ name: 'bi_hub_history_report_id' })
  bi_hub_history_report?: BiHubHistoryReports;
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