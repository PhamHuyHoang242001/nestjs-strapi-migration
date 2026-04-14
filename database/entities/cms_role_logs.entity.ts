import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

export enum CmsRoleLogsActionEnum {
  READ = 'read',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  DOWNLOAD = 'download',
}

export enum CmsRoleLogsLogStatusEnum {
  SUCCESS = 'success',
  ERROR = 'error',
}

export enum CmsRoleLogsTableEnum {
  ADMIN = 'admin',
}

export enum CmsRoleLogsClientTypeEnum {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('cms_role_logs')
export class CmsRoleLogs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  ip_address?: string;
  @Column({ type: 'varchar', nullable: true })
  uri?: string;
  @Column({ type: 'varchar', nullable: true })
  client_email?: string;
  @Column({ type: 'enum', enum: CmsRoleLogsActionEnum, nullable: true })
  action?: CmsRoleLogsActionEnum;
  @Column({ type: 'simple-json', nullable: true })
  old_data?: string;
  @Column({ type: 'simple-json', nullable: true })
  new_data?: string;
  @Column({ type: 'enum', enum: CmsRoleLogsLogStatusEnum, nullable: true })
  log_status?: CmsRoleLogsLogStatusEnum;
  @Column({ type: 'enum', enum: CmsRoleLogsTableEnum, nullable: true })
  table?: CmsRoleLogsTableEnum;
  @Column({ type: 'enum', enum: CmsRoleLogsClientTypeEnum, nullable: true })
  client_type?: CmsRoleLogsClientTypeEnum;
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