import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

export enum MaToolLogsActionEnum {
  READ = 'read',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  DOWNLOAD = 'download',
}

export enum MaToolLogsLogStatusEnum {
  SUCCESS = 'success',
  ERROR = 'error',
}

export enum MaToolLogsTableEnum {
  S3 = 's3',
  WORKSPACE = 'workspace',
  SUB_FOLDER = 'sub_folder',
  TEMPLATE = 'template',
  DOCUMENT = 'document',
}

export enum MaToolLogsClientTypeEnum {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('ma_tool_logs')
export class MaToolLogs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  ip_address?: string;
  @Column({ type: 'varchar', nullable: true })
  uri?: string;
  @Column({ type: 'varchar', nullable: true })
  client_email?: string;
  @Column({ type: 'enum', enum: MaToolLogsActionEnum, nullable: true })
  action?: MaToolLogsActionEnum;
  @Column({ type: 'simple-json', nullable: true })
  old_data?: string;
  @Column({ type: 'simple-json', nullable: true })
  new_data?: string;
  @Column({ type: 'enum', enum: MaToolLogsLogStatusEnum, nullable: true })
  log_status?: MaToolLogsLogStatusEnum;
  @Column({ type: 'enum', enum: MaToolLogsTableEnum, nullable: true })
  table?: MaToolLogsTableEnum;
  @Column({ type: 'enum', enum: MaToolLogsClientTypeEnum, nullable: true })
  client_type?: MaToolLogsClientTypeEnum;
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