import { Entity, Column, Index } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

// Supporter link between a user and a diagnostic report.
// Mirrors the PIC link table: intentionally relation-free — rows are read/written
// by explicit id joins, not TypeORM relations, so the report/user entities stay
// decoupled from this table. A report may have at most 10 supporters (enforced at
// the DTO layer on write).
@Entity('bi_hub_diagnostic_report_supporters')
@Index(['bi_hub_diagnostic_report_id'])
@Index(['user_id'])
export class BIHubDiagnosticReportSupporters extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'int' })
  bi_hub_diagnostic_report_id: number;
}
