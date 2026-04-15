import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BiHubReport } from './bi-hub-report.entity';

// File attachment for a BI Hub report — stored as flat metadata columns
@Entity('bi_hub_report_files')
export class BiHubReportFile extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public file_name: string;

  @Column({ type: 'int', nullable: true })
  public file_size: number;

  @Column({ nullable: true })
  public file_url: string;

  // FK to bi_hub_reports
  @Column({ type: 'int', nullable: false })
  public bi_hub_report_id: number;

  @ManyToOne(() => BiHubReport, (r) => r.files)
  @JoinColumn({ name: 'bi_hub_report_id' })
  public bi_hub_report: BiHubReport;
}
