import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BiHubLabels } from './bi_hub_labels.entity';
import { BiHubReports } from './bi_hub_reports.entity';

@Entity('bi_hub_labels_bi_hub_reports')
export class BiHubLabelsBiHubReports {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  bi_hub_labels_id: number;
  @ManyToOne(() => BiHubLabels)
  @JoinColumn({ name: 'bi_hub_labels_id' })
  bi_hub_labels?: BiHubLabels;

  @Column({ nullable: false })
  bi_hub_reports_id: number;
  @ManyToOne(() => BiHubReports)
  @JoinColumn({ name: 'bi_hub_reports_id' })
  bi_hub_reports?: BiHubReports;
}