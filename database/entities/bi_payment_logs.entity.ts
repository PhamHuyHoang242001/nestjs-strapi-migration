import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

export enum BiPaymentLogsActionEnum {
  READ = 'read',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  DOWNLOAD = 'download',
}

export enum BiPaymentLogsLogStatusEnum {
  SUCCESS = 'success',
  ERROR = 'error',
}

export enum BiPaymentLogsTableEnum {
  PROJECT = 'project',
  PROGRAM = 'program',
  CHECKLIST = 'checklist',
  COMMENT = 'comment',
  PIC_CONFIRMATION = 'pic_confirmation',
  HISTORY_PROGRAM = 'history_program',
}

export enum BiPaymentLogsClientTypeEnum {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('bi_payment_logs')
export class BiPaymentLogs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  ip_address?: string;
  @Column({ type: 'varchar', nullable: true })
  uri?: string;
  @Column({ type: 'varchar', nullable: true })
  client_email?: string;
  @Column({ type: 'enum', enum: BiPaymentLogsActionEnum, nullable: true })
  action?: BiPaymentLogsActionEnum;
  @Column({ type: 'simple-json', nullable: true })
  old_data?: string;
  @Column({ type: 'simple-json', nullable: true })
  new_data?: string;
  @Column({ type: 'enum', enum: BiPaymentLogsLogStatusEnum, nullable: true })
  log_status?: BiPaymentLogsLogStatusEnum;
  @Column({ type: 'enum', enum: BiPaymentLogsTableEnum, nullable: true })
  table?: BiPaymentLogsTableEnum;
  @Column({ type: 'enum', enum: BiPaymentLogsClientTypeEnum, nullable: true })
  client_type?: BiPaymentLogsClientTypeEnum;
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