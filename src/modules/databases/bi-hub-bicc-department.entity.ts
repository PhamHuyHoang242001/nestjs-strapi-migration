import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { BIHubDiagnosticReport } from './bi-diagnostic-report.entity';
import { BiHubReport } from './bi-hub-report.entity';

// Org hierarchy: BICC department level — parent of bi_hub_reports and bi_diagnostic_reports
@Entity('bi_hub_bicc_departments')
export class BiHubBiccDepartment extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;

  @Column({ nullable: true })
  public code: string;

  @Column({ nullable: true })
  public is_deleted: boolean;

  @OneToMany(() => BiHubReport, (r) => r.bicc_department)
  public reports: BiHubReport[];

  @OneToMany(() => BIHubDiagnosticReport, (r) => r.bicc_department)
  public diagnostic_reports: BIHubDiagnosticReport[];
}
