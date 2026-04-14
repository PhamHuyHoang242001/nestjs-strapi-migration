import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

export enum BiDiagnosticLogsActionEnum {
  READ = 'read',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  DOWNLOAD = 'download',
}

export enum BiDiagnosticLogsLogStatusEnum {
  SUCCESS = 'success',
  ERROR = 'error',
}

export enum BiDiagnosticLogsTableEnum {
  REPORT = 'report',
  BICC_DEPARTMENT = 'bicc-department',
  CENTER = 'center',
  DIVISION = 'division',
  DEPARTMENT = 'department',
  LABEL = 'label',
}

export enum BiDiagnosticLogsClientTypeEnum {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('bi_diagnostic_logs')
export class BiDiagnosticLogs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  ip_address?: string;
  @Column({ type: 'varchar', nullable: true })
  uri?: string;
  @Column({ type: 'varchar', nullable: true })
  client_email?: string;
  @Column({ type: 'enum', enum: BiDiagnosticLogsActionEnum, nullable: true })
  action?: BiDiagnosticLogsActionEnum;
  @Column({ type: 'simple-json', nullable: true })
  old_data?: string;
  @Column({ type: 'simple-json', nullable: true })
  new_data?: string;
  @Column({ type: 'enum', enum: BiDiagnosticLogsLogStatusEnum, nullable: true })
  log_status?: BiDiagnosticLogsLogStatusEnum;
  @Column({ type: 'enum', enum: BiDiagnosticLogsTableEnum, nullable: true })
  table?: BiDiagnosticLogsTableEnum;
  @Column({ type: 'enum', enum: BiDiagnosticLogsClientTypeEnum, nullable: true })
  client_type?: BiDiagnosticLogsClientTypeEnum;
  @Column({ type: 'text', nullable: true })
  error_message?: string;
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