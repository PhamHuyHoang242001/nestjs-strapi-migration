import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

export enum NewsLogsActionEnum {
  READ = 'read',
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  DOWNLOAD = 'download',
}

export enum NewsLogsLogStatusEnum {
  SUCCESS = 'success',
  ERROR = 'error',
}

export enum NewsLogsTableEnum {
  S3 = 's3',
  WORKSPACE = 'workspace',
  SUB_FOLDER = 'sub_folder',
  TEMPLATE = 'template',
  DOCUMENT = 'document',
}

export enum NewsLogsClientTypeEnum {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('news_logs')
export class NewsLogs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  ip_address?: string;
  @Column({ type: 'varchar', nullable: true })
  uri?: string;
  @Column({ type: 'varchar', nullable: true })
  client_email?: string;
  @Column({ type: 'enum', enum: NewsLogsActionEnum, nullable: true })
  action?: NewsLogsActionEnum;
  @Column({ type: 'simple-json', nullable: true })
  old_data?: string;
  @Column({ type: 'simple-json', nullable: true })
  new_data?: string;
  @Column({ type: 'enum', enum: NewsLogsLogStatusEnum, nullable: true })
  log_status?: NewsLogsLogStatusEnum;
  @Column({ type: 'enum', enum: NewsLogsTableEnum, nullable: true })
  table?: NewsLogsTableEnum;
  @Column({ type: 'enum', enum: NewsLogsClientTypeEnum, nullable: true })
  client_type?: NewsLogsClientTypeEnum;
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