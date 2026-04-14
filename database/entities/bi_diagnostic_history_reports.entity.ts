import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BiDiagnosticReports } from './bi_diagnostic_reports.entity';
import { Admins } from './admins.entity';

@Entity('bi_diagnostic_history_reports')
export class BiDiagnosticHistoryReports {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  name?: string;
  @Column({ type: 'simple-json', nullable: true })
  change_log?: string;
  @Column({ type: 'int', nullable: true })
  version?: number;
  @Column({ type: 'int', nullable: true })
  diagnostic_files_id?: number;
  @Column({ type: 'varchar', nullable: true })
  diagnostic_files_name?: string;
  @Column({ type: 'varchar', nullable: true })
  diagnostic_files_url?: string;
  @Column({ type: 'varchar', nullable: true })
  diagnostic_files_type?: string;
  @Column({ nullable: true })
  diagnostic_report_id?: number;
  @ManyToOne(() => BiDiagnosticReports)
  @JoinColumn({ name: 'diagnostic_report_id' })
  diagnostic_report?: BiDiagnosticReports;
  @Column({ type: 'boolean', nullable: true })
  is_change_link?: boolean;
  @Column({ type: 'varchar', nullable: true })
  code?: string;
  @Column({ nullable: true })
  created_by?: number;
  @ManyToOne(() => Admins)
  @JoinColumn({ name: 'created_by' })
  created_by_admin?: Admins;
  @Column({ nullable: true })
  updated_by?: number;
  @ManyToOne(() => Admins)
  @JoinColumn({ name: 'updated_by' })
  updated_by_admin?: Admins;
}