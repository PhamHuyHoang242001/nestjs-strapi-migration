import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

export enum UserLogsActionEnum {
  READ = 'read',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  DOWNLOAD = 'download',
}

export enum UserLogsLogStatusEnum {
  SUCCESS = 'success',
  ERROR = 'error',
}

export enum UserLogsTableEnum {
  USER = 'user',
}

export enum UserLogsClientTypeEnum {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('user_logs')
export class UserLogs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  ip_address?: string;
  @Column({ type: 'varchar', nullable: true })
  uri?: string;
  @Column({ type: 'varchar', nullable: true })
  client_email?: string;
  @Column({ type: 'enum', enum: UserLogsActionEnum, nullable: true })
  action?: UserLogsActionEnum;
  @Column({ type: 'simple-json', nullable: true })
  old_data?: string;
  @Column({ type: 'simple-json', nullable: true })
  new_data?: string;
  @Column({ type: 'enum', enum: UserLogsLogStatusEnum, nullable: true })
  log_status?: UserLogsLogStatusEnum;
  @Column({ type: 'enum', enum: UserLogsTableEnum, nullable: true })
  table?: UserLogsTableEnum;
  @Column({ type: 'enum', enum: UserLogsClientTypeEnum, nullable: true })
  client_type?: UserLogsClientTypeEnum;
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