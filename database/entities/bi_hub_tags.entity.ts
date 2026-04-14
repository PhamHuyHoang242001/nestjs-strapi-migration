import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { FeedbackUsers } from './feedback_users.entity';
import { BiHubReportsBiHubTags } from './bi_hub_reports_bi_hub_tags.entity';
import { BiHubHistoryReports } from './bi_hub_history_reports.entity';
import { Admins } from './admins.entity';

export enum BiHubTagsTypeEnum {
  ADHOC = 'adhoc',
  REGULAR = 'regular',
}

export enum BiHubTagsTagStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('bi_hub_tags')
export class BiHubTags {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  user_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'user_id' })
  user?: FeedbackUsers;
  @OneToMany(() => BiHubReportsBiHubTags, (p) => p.bi_hub_tags)
  bi_hub_reports_links?: BiHubReportsBiHubTags[];
  @Column({ type: 'varchar', nullable: false })
  name?: string;
  @Column({ type: 'enum', enum: BiHubTagsTypeEnum, nullable: true })
  type?: BiHubTagsTypeEnum;
  @Column({ type: 'enum', enum: BiHubTagsTagStatusEnum, nullable: true })
  tag_status?: BiHubTagsTagStatusEnum;
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