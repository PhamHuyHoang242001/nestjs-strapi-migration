import { BiHubRatingStatus, BiHubTagType } from '@common/enums';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BiHubReport } from './bi-hub-report.entity';

// Star rating submitted by a user for a BI Hub report
@Entity('bi_hub_ratings')
export class BiHubRating extends BaseSoftDeleteEntity {
  @Column({ type: 'int', nullable: true, default: 5 })
  public rate: number;

  @Column({ type: 'enum', enum: BiHubTagType, nullable: true })
  public type: BiHubTagType;

  @Column({
    type: 'enum',
    enum: BiHubRatingStatus,
    nullable: true,
    default: BiHubRatingStatus.ACTIVE,
  })
  public rating_status: BiHubRatingStatus;

  // Plain user FK — no relation decorator per project rules
  @Column({ type: 'int', nullable: true })
  public user_id: number;

  // FK to bi_hub_reports
  @Column({ type: 'int', nullable: true })
  public bi_hub_report_id: number;

  @ManyToOne(() => BiHubReport, (r) => r.ratings)
  @JoinColumn({ name: 'bi_hub_report_id' })
  public bi_hub_report: BiHubReport;

  // Optional link to a history snapshot
  @Column({ type: 'int', nullable: true })
  public bi_hub_history_report_id: number;
}
