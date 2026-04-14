import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BiDiagnosticReports } from './bi_diagnostic_reports.entity';
import { Admins } from './admins.entity';

export enum BiDiagnosticFilesFileStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('bi_diagnostic_files')
export class BiDiagnosticFiles {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  file_media?: string;
  @Column({ type: 'varchar', nullable: true })
  file_url?: string;
  @Column({ type: 'varchar', nullable: true })
  type?: string;
  @Column({ type: 'varchar', nullable: true })
  name?: string;
  @Column({ nullable: true })
  diagnostic_report_id?: number;
  @ManyToOne(() => BiDiagnosticReports)
  @JoinColumn({ name: 'diagnostic_report_id' })
  diagnostic_report?: BiDiagnosticReports;
  @Column({ type: 'boolean', nullable: true })
  lastest_version?: boolean;
  @Column({ type: 'enum', enum: BiDiagnosticFilesFileStatusEnum, nullable: true })
  file_status?: BiDiagnosticFilesFileStatusEnum;
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