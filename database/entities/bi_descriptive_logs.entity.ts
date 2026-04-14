import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

export enum BiDescriptiveLogsActionEnum {
  READ = 'read',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  DOWNLOAD = 'download',
}

export enum BiDescriptiveLogsLogStatusEnum {
  SUCCESS = 'success',
  ERROR = 'error',
}

export enum BiDescriptiveLogsTableEnum {
  REPORT = 'report',
  BICC_DEPARTMENT = 'bicc-department',
  CENTER = 'center',
  DIVISION = 'division',
  DEPARTMENT = 'department',
  LABEL = 'label',
}

export enum BiDescriptiveLogsClientTypeEnum {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('bi_descriptive_logs')
export class BiDescriptiveLogs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  ip_address?: string;
  @Column({ type: 'varchar', nullable: true })
  uri?: string;
  @Column({ type: 'varchar', nullable: true })
  client_email?: string;
  @Column({ type: 'enum', enum: BiDescriptiveLogsActionEnum, nullable: true })
  action?: BiDescriptiveLogsActionEnum;
  @Column({ type: 'simple-json', nullable: true })
  old_data?: string;
  @Column({ type: 'simple-json', nullable: true })
  new_data?: string;
  @Column({ type: 'enum', enum: BiDescriptiveLogsLogStatusEnum, nullable: true })
  log_status?: BiDescriptiveLogsLogStatusEnum;
  @Column({ type: 'enum', enum: BiDescriptiveLogsTableEnum, nullable: true })
  table?: BiDescriptiveLogsTableEnum;
  @Column({ type: 'enum', enum: BiDescriptiveLogsClientTypeEnum, nullable: true })
  client_type?: BiDescriptiveLogsClientTypeEnum;
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