import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { FeedbackUsers } from './feedback_users.entity';
import { Admins } from './admins.entity';

export enum DataSelfServeRequestsRequestStatusEnum {
  SUCCESSFULLY = 'successfully',
  FAILED = 'failed',
  PROCESSING = 'processing',
  SUBMITED = 'submited',
  DRAFT = 'draft',
}

export enum DataSelfServeRequestsRequestGroupEnum {
  EDAPORTAL_TRACUULICHTRANO = 'EDAPORTAL_TRACUULICHTRANO',
}

export enum DataSelfServeRequestsValidationStatusEnum {
  PROCESSING = 'processing',
  SUCCESSFULLY = 'successfully',
  FAILED = 'failed',
}

export enum DataSelfServeRequestsInputMethodEnum {
  MANUAL = 'manual',
  UPLOAD = 'upload',
}

export enum DataSelfServeRequestsStorageTypeEnum {
  S3 = 's3',
  SFTP = 'sftp',
}

@Entity('data_self_serve_requests')
export class DataSelfServeRequests {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'enum', enum: DataSelfServeRequestsRequestStatusEnum, nullable: true })
  request_status?: DataSelfServeRequestsRequestStatusEnum;
  @Column({ type: 'enum', enum: DataSelfServeRequestsRequestGroupEnum, nullable: true })
  request_group?: DataSelfServeRequestsRequestGroupEnum;
  @Column({ type: 'enum', enum: DataSelfServeRequestsValidationStatusEnum, nullable: true })
  validation_status?: DataSelfServeRequestsValidationStatusEnum;
  @Column({ type: 'varchar', nullable: true })
  destination_path?: string;
  @Column({ type: 'varchar', nullable: true })
  backup_input_file_path?: string;
  @Column({ type: 'varchar', nullable: true })
  code?: string;
  @Column({ type: 'varchar', nullable: true })
  portal_file_url?: string;
  @Column({ type: 'enum', enum: DataSelfServeRequestsInputMethodEnum, nullable: true })
  input_method?: DataSelfServeRequestsInputMethodEnum;
  @Column({ type: 'varchar', nullable: true })
  file_size?: string;
  @Column({ type: 'varchar', nullable: true })
  source?: string;
  @Column({ type: 'enum', enum: DataSelfServeRequestsStorageTypeEnum, nullable: true })
  storage_type?: DataSelfServeRequestsStorageTypeEnum;
  @Column({ type: 'int', nullable: true })
  estimated_completion_hours?: number;
  @Column({ type: 'simple-json', nullable: true })
  request_params?: string;
  @Column({ type: 'simple-json', nullable: true })
  response_body?: string;
  @Column({ type: 'simple-json', nullable: true })
  rows_file_input?: string;
  @Column({ nullable: true })
  created_by_user_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by_user?: FeedbackUsers;
  @Column({ nullable: true })
  updated_by_user_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'updated_by_user_id' })
  updated_by_user?: FeedbackUsers;
  // OneToMany inverse: validation_logs -> DataSelfServeValidationLogs
  @Column({ type: 'timestamp', nullable: true })
  request_completed_at?: string;
  @Column({ type: 'varchar', nullable: true })
  short_description?: string;
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