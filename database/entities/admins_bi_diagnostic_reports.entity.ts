import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';
import { BiDiagnosticReports } from './bi_diagnostic_reports.entity';

@Entity('admins_bi_diagnostic_reports')
export class AdminsBiDiagnosticReports {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  admins_id: number;
  @ManyToOne(() => Admins)
  @JoinColumn({ name: 'admins_id' })
  admins?: Admins;

  @Column({ nullable: false })
  bi_diagnostic_reports_id: number;
  @ManyToOne(() => BiDiagnosticReports)
  @JoinColumn({ name: 'bi_diagnostic_reports_id' })
  bi_diagnostic_reports?: BiDiagnosticReports;
}