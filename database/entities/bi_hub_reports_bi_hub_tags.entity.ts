import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BiHubReports } from './bi_hub_reports.entity';
import { BiHubTags } from './bi_hub_tags.entity';

@Entity('bi_hub_reports_bi_hub_tags')
export class BiHubReportsBiHubTags {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  bi_hub_reports_id: number;
  @ManyToOne(() => BiHubReports)
  @JoinColumn({ name: 'bi_hub_reports_id' })
  bi_hub_reports?: BiHubReports;

  @Column({ nullable: false })
  bi_hub_tags_id: number;
  @ManyToOne(() => BiHubTags)
  @JoinColumn({ name: 'bi_hub_tags_id' })
  bi_hub_tags?: BiHubTags;
}