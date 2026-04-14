import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

export enum UserScreenLogsActionEnum {
  READ = 'read',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  DOWNLOAD = 'download',
}

export enum UserScreenLogsLogStatusEnum {
  SUCCESS = 'success',
  ERROR = 'error',
}

export enum UserScreenLogsTableEnum {
  ADMIN = 'admin',
}

export enum UserScreenLogsClientTypeEnum {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('user_screen_logs')
export class UserScreenLogs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  ip_address?: string;
  @Column({ type: 'varchar', nullable: true })
  uri?: string;
  @Column({ type: 'varchar', nullable: true })
  client_email?: string;
  @Column({ type: 'enum', enum: UserScreenLogsActionEnum, nullable: true })
  action?: UserScreenLogsActionEnum;
  @Column({ type: 'simple-json', nullable: true })
  old_data?: string;
  @Column({ type: 'simple-json', nullable: true })
  new_data?: string;
  @Column({ type: 'enum', enum: UserScreenLogsLogStatusEnum, nullable: true })
  log_status?: UserScreenLogsLogStatusEnum;
  @Column({ type: 'enum', enum: UserScreenLogsTableEnum, nullable: true })
  table?: UserScreenLogsTableEnum;
  @Column({ type: 'enum', enum: UserScreenLogsClientTypeEnum, nullable: true })
  client_type?: UserScreenLogsClientTypeEnum;
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