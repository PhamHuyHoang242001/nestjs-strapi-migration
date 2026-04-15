import { BiHubReportCommentStatus } from '@common/enums';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BiHubReport } from './bi-hub-report.entity';

// Comment left by a user on a BI Hub report or history snapshot
@Entity('bi_hub_report_comments')
export class BiHubReportComment extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public content: string;

  @Column({
    type: 'enum',
    enum: BiHubReportCommentStatus,
    nullable: true,
    default: BiHubReportCommentStatus.ACTIVE,
  })
  public report_comment_status: BiHubReportCommentStatus;

  // Plain user FK — no relation decorator per project rules
  @Column({ type: 'int', nullable: true })
  public user_id: number;

  // FK to bi_hub_reports
  @Column({ type: 'int', nullable: false })
  public bi_hub_report_id: number;

  @ManyToOne(() => BiHubReport, (r) => r.comments)
  @JoinColumn({ name: 'bi_hub_report_id' })
  public bi_hub_report: BiHubReport;

  // Optional link to a history snapshot
  @Column({ type: 'int', nullable: true })
  public bi_hub_history_report_id: number;
}
