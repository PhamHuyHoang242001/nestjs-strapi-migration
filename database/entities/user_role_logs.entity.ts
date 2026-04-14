import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

export enum UserRoleLogsActionEnum {
  READ = 'read',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  DOWNLOAD = 'download',
}

export enum UserRoleLogsLogStatusEnum {
  SUCCESS = 'success',
  ERROR = 'error',
}

export enum UserRoleLogsTableEnum {
  USER_ROLE = 'user_role',
}

export enum UserRoleLogsClientTypeEnum {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('user_role_logs')
export class UserRoleLogs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  ip_address?: string;
  @Column({ type: 'varchar', nullable: true })
  uri?: string;
  @Column({ type: 'varchar', nullable: true })
  client_email?: string;
  @Column({ type: 'enum', enum: UserRoleLogsActionEnum, nullable: true })
  action?: UserRoleLogsActionEnum;
  @Column({ type: 'simple-json', nullable: true })
  old_data?: string;
  @Column({ type: 'simple-json', nullable: true })
  new_data?: string;
  @Column({ type: 'enum', enum: UserRoleLogsLogStatusEnum, nullable: true })
  log_status?: UserRoleLogsLogStatusEnum;
  @Column({ type: 'enum', enum: UserRoleLogsTableEnum, nullable: true })
  table?: UserRoleLogsTableEnum;
  @Column({ type: 'enum', enum: UserRoleLogsClientTypeEnum, nullable: true })
  client_type?: UserRoleLogsClientTypeEnum;
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