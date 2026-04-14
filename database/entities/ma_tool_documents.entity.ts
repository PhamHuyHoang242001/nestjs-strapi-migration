import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { MaToolTemplates } from './ma_tool_templates.entity';
import { FeedbackUsers } from './feedback_users.entity';
import { BiPaymentChecklists } from './bi_payment_checklists.entity';
import { Admins } from './admins.entity';

export enum MaToolDocumentsDocumentStatusEnum {
  DRAFT = 'draft',
  SUBMIT = 'submit',
  APPROVAL = 'approval',
  REJECTED = 'rejected',
}

export enum MaToolDocumentsValidateModeEnum {
  CSV = 'csv',
  EXCEL = 'excel',
}

export enum MaToolDocumentsBackDateTypeEnum {
  DATE = 'date',
  FILE = 'file',
}

export enum MaToolDocumentsValidationStatusEnum {
  SUCCESSFULLY = 'successfully',
  FAILED = 'failed',
  PROCESSING = 'processing',
}

export enum MaToolDocumentsConvertStatusEnum {
  SUCCESSFULLY = 'successfully',
  FAILED = 'failed',
  PROCESSING = 'processing',
}

export enum MaToolDocumentsS3UploadStatusEnum {
  SUCCESSFULLY = 'successfully',
  FAILED = 'failed',
  PROCESSING = 'processing',
}

export enum MaToolDocumentsSftpUploadStatusEnum {
  SUCCESSFULLY = 'successfully',
  FAILED = 'failed',
  PROCESSING = 'processing',
}

export enum MaToolDocumentsDocumentTypeEnum {
  MA_TOOL = 'ma-tool',
  BI_PAYMENT = 'bi-payment',
}

@Entity('ma_tool_documents')
export class MaToolDocuments {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  name?: string;
  @Column({ type: 'int', nullable: true })
  convert_time?: number;
  @Column({ type: 'text', nullable: true })
  description?: string;
  @Column({ type: 'varchar', nullable: true })
  file_url?: string;
  @Column({ type: 'varchar', nullable: true })
  portal_file_url?: string;
  @Column({ type: 'simple-json', nullable: true })
  exploit_file_urls?: string;
  @Column({ type: 'varchar', nullable: true })
  rejection_reason?: string;
  @Column({ type: 'varchar', nullable: true })
  file_size?: string;
  @Column({ type: 'enum', enum: MaToolDocumentsDocumentStatusEnum, nullable: true })
  document_status?: MaToolDocumentsDocumentStatusEnum;
  @Column({ type: 'enum', enum: MaToolDocumentsValidateModeEnum, nullable: true })
  validate_mode?: MaToolDocumentsValidateModeEnum;
  @Column({ type: 'varchar', nullable: true })
  processor_mode?: string;
  @Column({ type: 'boolean', nullable: true })
  back_date_mode?: boolean;
  @Column({ type: 'enum', enum: MaToolDocumentsBackDateTypeEnum, nullable: true })
  back_date_type?: MaToolDocumentsBackDateTypeEnum;
  @Column({ type: 'int', nullable: true })
  back_date_file_id?: number;
  @Column({ type: 'timestamp', nullable: true })
  back_date_time?: string;
  @Column({ type: 'timestamp', nullable: true })
  approved_at?: string;
  @Column({ nullable: true })
  template_id?: number;
  @ManyToOne(() => MaToolTemplates)
  @JoinColumn({ name: 'template_id' })
  template?: MaToolTemplates;
  @Column({ nullable: true })
  document_created_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'document_created_by_id' })
  document_created_by?: FeedbackUsers;
  @Column({ nullable: true })
  document_updated_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'document_updated_by_id' })
  document_updated_by?: FeedbackUsers;
  // OneToMany inverse: validation_logs -> MaToolValidationLogs
  @Column({ type: 'enum', enum: MaToolDocumentsValidationStatusEnum, nullable: true })
  validation_status?: MaToolDocumentsValidationStatusEnum;
  @Column({ type: 'enum', enum: MaToolDocumentsConvertStatusEnum, nullable: true })
  convert_status?: MaToolDocumentsConvertStatusEnum;
  @Column({ type: 'simple-json', nullable: true })
  logs?: string;
  @Column({ type: 'simple-json', nullable: true })
  rows?: string;
  @Column({ type: 'boolean', nullable: true })
  is_deleted?: boolean;
  @Column({ type: 'varchar', nullable: true })
  s3_destination_path?: string;
  @Column({ type: 'varchar', nullable: true })
  s3_portal_destination_path?: string;
  @Column({ type: 'varchar', nullable: true })
  keyed_s3_destination_path?: string;
  @Column({ type: 'varchar', nullable: true })
  converted_s3_destination_path?: string;
  @Column({ type: 'boolean', nullable: true })
  is_insert_unique_column?: boolean;
  @Column({ type: 'enum', enum: MaToolDocumentsS3UploadStatusEnum, nullable: true })
  s3_upload_status?: MaToolDocumentsS3UploadStatusEnum;
  @Column({ type: 'enum', enum: MaToolDocumentsSftpUploadStatusEnum, nullable: true })
  sftp_upload_status?: MaToolDocumentsSftpUploadStatusEnum;
  @Column({ nullable: true })
  approved_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'approved_by_id' })
  approved_by?: FeedbackUsers;
  @Column({ type: 'simple-json', nullable: true })
  s3_upload_success?: string;
  @Column({ type: 'simple-json', nullable: true })
  s3_upload_failed?: string;
  @Column({ type: 'enum', enum: MaToolDocumentsDocumentTypeEnum, nullable: true })
  document_type?: MaToolDocumentsDocumentTypeEnum;
  @Column({ type: 'boolean', nullable: true })
  is_reuploaded?: boolean;
  // OneToMany inverse: bi_payment_other_files -> BiPaymentOtherFiles
  @Column({ nullable: true })
  bi_payment_checklist_id?: number;
  @ManyToOne(() => BiPaymentChecklists)
  @JoinColumn({ name: 'bi_payment_checklist_id' })
  bi_payment_checklist?: BiPaymentChecklists;
  @Column({ nullable: true })
  rejected_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'rejected_by_id' })
  rejected_by?: FeedbackUsers;
  @Column({ type: 'timestamp', nullable: true })
  rejected_at?: string;
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