import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { MaToolTemplates } from './ma_tool_templates.entity';
import { FeedbackUsers } from './feedback_users.entity';
import { Admins } from './admins.entity';

export enum MaToolTemplateHistoriesUploadMethodEnum {
  OVERRIDE = 'override',
  APPEND = 'append',
}

export enum MaToolTemplateHistoriesUploadDateFrequencyEnum {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export enum MaToolTemplateHistoriesExploitFrequencyEnum {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export enum MaToolTemplateHistoriesTemplateStatusEnum {
  DRAFT = 'draft',
  SUBMIT = 'submit',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  APPROVAL = 'approval',
  REJECTED = 'rejected',
}

@Entity('ma_tool_template_histories')
export class MaToolTemplateHistories {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'boolean', nullable: true })
  is_deleted?: boolean;
  @Column({ type: 'int', nullable: true })
  version?: number;
  @Column({ nullable: true })
  template_id?: number;
  @ManyToOne(() => MaToolTemplates)
  @JoinColumn({ name: 'template_id' })
  template?: MaToolTemplates;
  @Column({ type: 'simple-json', nullable: true })
  change_log?: string;
  @Column({ type: 'varchar', nullable: true })
  name?: string;
  @Column({ type: 'varchar', nullable: true })
  description?: string;
  @Column({ type: 'varchar', nullable: true })
  image_url?: string;
  @Column({ type: 'enum', enum: MaToolTemplateHistoriesUploadMethodEnum, nullable: true })
  upload_method?: MaToolTemplateHistoriesUploadMethodEnum;
  @Column({ type: 'enum', enum: MaToolTemplateHistoriesUploadDateFrequencyEnum, nullable: true })
  upload_date_frequency?: MaToolTemplateHistoriesUploadDateFrequencyEnum;
  @Column({ type: 'enum', enum: MaToolTemplateHistoriesExploitFrequencyEnum, nullable: true })
  exploit_frequency?: MaToolTemplateHistoriesExploitFrequencyEnum;
  @Column({ type: 'timestamp', nullable: true })
  exploit_date?: string;
  @Column({ type: 'enum', enum: MaToolTemplateHistoriesTemplateStatusEnum, nullable: true })
  template_status?: MaToolTemplateHistoriesTemplateStatusEnum;
  @Column({ type: 'timestamp', nullable: true })
  request_active_at?: string;
  @Column({ type: 'timestamp', nullable: true })
  approved_at?: string;
  @Column({ type: 'timestamp', nullable: true })
  activated_at?: string;
  @Column({ type: 'timestamp', nullable: true })
  inactivated_at?: string;
  @Column({ type: 'timestamp', nullable: true })
  rejected_at?: string;
  @Column({ type: 'timestamp', nullable: true })
  deleted_at?: string;
  @Column({ type: 'simple-json', nullable: true })
  workspace?: string;
  @Column({ type: 'simple-json', nullable: true })
  owners?: string;
  @Column({ type: 'simple-json', nullable: true })
  uploaders?: string;
  @Column({ type: 'simple-json', nullable: true })
  approvers?: string;
  @Column({ type: 'simple-json', nullable: true })
  sheet_templates?: string;
  @Column({ type: 'simple-json', nullable: true })
  documents?: string;
  @Column({ type: 'simple-json', nullable: true })
  approved_by?: string;
  @Column({ type: 'simple-json', nullable: true })
  inactivated_by?: string;
  @Column({ type: 'timestamp', nullable: true })
  activated_by?: string;
  @Column({ type: 'simple-json', nullable: true })
  rejected_by?: string;
  @Column({ type: 'timestamp', nullable: true })
  sending_date?: string;
  @Column({ type: 'timestamp', nullable: true })
  ending_date?: string;
  @Column({ type: 'text', nullable: true })
  reason?: string;
  @Column({ type: 'simple-json', nullable: true })
  exploit_workspaces?: string;
  @Column({ nullable: true })
  ma_tool_template_history_created_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'ma_tool_template_history_created_by_id' })
  ma_tool_template_history_created_by?: FeedbackUsers;
  @Column({ nullable: true })
  ma_tool_template_history_updated_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'ma_tool_template_history_updated_by_id' })
  ma_tool_template_history_updated_by?: FeedbackUsers;
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