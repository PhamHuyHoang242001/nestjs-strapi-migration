import {
  DataSelfServeRequestGroup,
  DataSelfServeRequestStatus,
  DataSelfServeStorageType,
  DataSelfServeUploadMethod,
  DataSelfServeValidationStatus,
} from '@common/enums';
import { BaseAuthorUserSoftDeleteColumn } from '@configuration/base-entity';
import { Column, Entity, OneToMany } from 'typeorm';
import { DataSelfServeValidationLog } from './data-self-serve-validation-log.entity';

@Entity('data_self_serve_requests')
export class DataSelfServeRequest extends BaseAuthorUserSoftDeleteColumn {
  @Column({ nullable: true })
  request_status: DataSelfServeRequestStatus;

  @Column({ nullable: true })
  request_group: DataSelfServeRequestGroup;

  @Column({ nullable: true })
  validation_status: DataSelfServeValidationStatus;

  @Column({ type: 'varchar', nullable: true })
  destination_path: string;

  @Column({ type: 'varchar', nullable: true })
  backup_input_file_path: string;

  @Column({ type: 'varchar', nullable: true })
  code: string;

  @Column({ type: 'varchar', nullable: true })
  portal_file_url: string;

  @Column({ nullable: true })
  input_method: DataSelfServeUploadMethod;

  @Column({ type: 'varchar', nullable: true })
  file_size: string;

  @Column({ type: 'varchar', nullable: true })
  source: string;

  @Column({ nullable: true })
  storage_type: DataSelfServeStorageType;

  @Column({ type: 'int', nullable: true })
  estimated_completion_hours: number;

  @Column({ type: 'jsonb', nullable: true })
  request_params: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  response_body: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  rows_file_input: Record<string, unknown>;

  @Column({ type: 'timestamp', nullable: true })
  request_completed_at: Date;

  @Column({ type: 'varchar', nullable: true })
  short_description: string;

  @OneToMany(() => DataSelfServeValidationLog, (log) => log.request)
  validation_logs: DataSelfServeValidationLog[];
}

export {
  DataSelfServeRequestGroup as DataSelfServeRequestGroupEnum,
  DataSelfServeRequestStatus as DataSelfServeRequestStatusEnum,
  DataSelfServeStorageType as DataSelfServeRequestStorageTypeEnum,
  DataSelfServeUploadMethod as DataSelfServeRequestInputMethodEnum,
  DataSelfServeValidationStatus as DataSelfServeRequestValidationStatusEnum,
};
