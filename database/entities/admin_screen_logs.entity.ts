import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

export enum AdminScreenLogsActionEnum {
  READ = 'read',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  DOWNLOAD = 'download',
}

export enum AdminScreenLogsLogStatusEnum {
  SUCCESS = 'success',
  ERROR = 'error',
}

export enum AdminScreenLogsTableEnum {
  ADMIN = 'admin',
}

export enum AdminScreenLogsClientTypeEnum {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('admin_screen_logs')
export class AdminScreenLogs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  ip_address?: string;
  @Column({ type: 'varchar', nullable: true })
  uri?: string;
  @Column({ type: 'varchar', nullable: true })
  client_email?: string;
  @Column({ type: 'enum', enum: AdminScreenLogsActionEnum, nullable: true })
  action?: AdminScreenLogsActionEnum;
  @Column({ type: 'simple-json', nullable: true })
  old_data?: string;
  @Column({ type: 'simple-json', nullable: true })
  new_data?: string;
  @Column({ type: 'enum', enum: AdminScreenLogsLogStatusEnum, nullable: true })
  log_status?: AdminScreenLogsLogStatusEnum;
  @Column({ type: 'enum', enum: AdminScreenLogsTableEnum, nullable: true })
  table?: AdminScreenLogsTableEnum;
  @Column({ type: 'enum', enum: AdminScreenLogsClientTypeEnum, nullable: true })
  client_type?: AdminScreenLogsClientTypeEnum;
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