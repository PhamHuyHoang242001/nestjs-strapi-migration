import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BiHubHistoryReports } from './bi_hub_history_reports.entity';
import { BiHubLabels } from './bi_hub_labels.entity';

@Entity('bi_hub_history_reports_bi_hub_labels')
export class BiHubHistoryReportsBiHubLabels {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  bi_hub_history_reports_id: number;
  @ManyToOne(() => BiHubHistoryReports)
  @JoinColumn({ name: 'bi_hub_history_reports_id' })
  bi_hub_history_reports?: BiHubHistoryReports;

  @Column({ nullable: false })
  bi_hub_labels_id: number;
  @ManyToOne(() => BiHubLabels)
  @JoinColumn({ name: 'bi_hub_labels_id' })
  bi_hub_labels?: BiHubLabels;
}