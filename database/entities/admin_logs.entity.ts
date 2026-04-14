import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

export enum AdminLogsActionEnum {
  READ = 'read',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  DOWNLOAD = 'download',
}

export enum AdminLogsLogStatusEnum {
  SUCCESS = 'success',
  ERROR = 'error',
}

export enum AdminLogsTableEnum {
  ADMIN = 'admin',
}

export enum AdminLogsClientTypeEnum {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('admin_logs')
export class AdminLogs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  ip_address?: string;
  @Column({ type: 'varchar', nullable: true })
  uri?: string;
  @Column({ type: 'varchar', nullable: true })
  client_email?: string;
  @Column({ type: 'enum', enum: AdminLogsActionEnum, nullable: true })
  action?: AdminLogsActionEnum;
  @Column({ type: 'simple-json', nullable: true })
  old_data?: string;
  @Column({ type: 'simple-json', nullable: true })
  new_data?: string;
  @Column({ type: 'enum', enum: AdminLogsLogStatusEnum, nullable: true })
  log_status?: AdminLogsLogStatusEnum;
  @Column({ type: 'enum', enum: AdminLogsTableEnum, nullable: true })
  table?: AdminLogsTableEnum;
  @Column({ type: 'enum', enum: AdminLogsClientTypeEnum, nullable: true })
  client_type?: AdminLogsClientTypeEnum;
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