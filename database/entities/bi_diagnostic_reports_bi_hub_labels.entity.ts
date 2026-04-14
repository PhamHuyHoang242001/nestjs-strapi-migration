import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BiDiagnosticReports } from './bi_diagnostic_reports.entity';
import { BiHubLabels } from './bi_hub_labels.entity';

@Entity('bi_diagnostic_reports_bi_hub_labels')
export class BiDiagnosticReportsBiHubLabels {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  bi_diagnostic_reports_id: number;
  @ManyToOne(() => BiDiagnosticReports)
  @JoinColumn({ name: 'bi_diagnostic_reports_id' })
  bi_diagnostic_reports?: BiDiagnosticReports;

  @Column({ nullable: false })
  bi_hub_labels_id: number;
  @ManyToOne(() => BiHubLabels)
  @JoinColumn({ name: 'bi_hub_labels_id' })
  bi_hub_labels?: BiHubLabels;
}