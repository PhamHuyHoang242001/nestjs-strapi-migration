import { Entity, Column, Index } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

// PIC (person-in-charge) link between a user and a diagnostic report.
// Intentionally relation-free: rows are read/written by explicit id joins, not
// TypeORM relations, so the report/user entities stay decoupled from this table.
@Entity('bi_hub_diagnostic_report_pics')
@Index(['bi_hub_diagnostic_report_id'])
@Index(['user_id'])
export class BIHubDiagnosticReportPics extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'int' })
  bi_hub_diagnostic_report_id: number;
}
