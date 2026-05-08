import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BIHubDiagnosticReport } from './bi-diagnostic-report.entity';

export enum BIHubDiagnosticFileStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('bi_hub_diagnostic_files')
export class BiHubDiagnosticFile extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar', nullable: true })
  file_media: string;

  @Column({ type: 'varchar', nullable: true })
  file_url: string;

  @Column({ type: 'varchar', nullable: true })
  type: string;

  @Column({ type: 'varchar', nullable: true })
  name: string;

  @Column({ nullable: true })
  bi_hub_diagnostic_report_id: number;

  @ManyToOne(() => BIHubDiagnosticReport, (r) => r.bi_hub_diagnostic_files)
  @JoinColumn({ name: 'bi_hub_diagnostic_report_id' })
  bi_hub_diagnostic_report: BIHubDiagnosticReport;

  @Column({ type: 'boolean', nullable: true })
  lastest_version: boolean;

  @Column({ type: 'enum', enum: BIHubDiagnosticFileStatus, nullable: true })
  status: BIHubDiagnosticFileStatus;
}
