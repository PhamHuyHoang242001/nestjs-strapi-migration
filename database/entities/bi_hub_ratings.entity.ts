import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { FeedbackUsers } from './feedback_users.entity';
import { BiHubReports } from './bi_hub_reports.entity';
import { BiHubHistoryReports } from './bi_hub_history_reports.entity';
import { Admins } from './admins.entity';

export enum BiHubRatingsTypeEnum {
  ADHOC = 'adhoc',
  REGULAR = 'regular',
}

export enum BiHubRatingsRatingStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('bi_hub_ratings')
export class BiHubRatings {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  user_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'user_id' })
  user?: FeedbackUsers;
  @Column({ type: 'int', nullable: true })
  rate?: number;
  @Column({ type: 'enum', enum: BiHubRatingsTypeEnum, nullable: true })
  type?: BiHubRatingsTypeEnum;
  @Column({ type: 'enum', enum: BiHubRatingsRatingStatusEnum, nullable: true })
  rating_status?: BiHubRatingsRatingStatusEnum;
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