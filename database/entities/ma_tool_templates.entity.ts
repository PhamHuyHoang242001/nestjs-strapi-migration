import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { MaToolWorkspaces } from './ma_tool_workspaces.entity';
import { FeedbackUsersMaToolTemplates } from './feedback_users_ma_tool_templates.entity';
import { FeedbackUsers } from './feedback_users.entity';
import { MaToolTemplatesMaToolWorkspaces } from './ma_tool_templates_ma_tool_workspaces.entity';
import { BiPaymentPrograms } from './bi_payment_programs.entity';
import { Admins } from './admins.entity';

export enum MaToolTemplatesUploadMethodEnum {
  OVERRIDE = 'override',
  APPEND = 'append',
  SCD2 = 'scd2',
}

export enum MaToolTemplatesUploadDateFrequencyEnum {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export enum MaToolTemplatesExploitFrequencyEnum {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export enum MaToolTemplatesTemplateStatusEnum {
  DRAFT = 'draft',
  SUBMIT = 'submit',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  APPROVAL = 'approval',
  REJECTED = 'rejected',
}

export enum MaToolTemplatesTemplateTypeEnum {
  MA_TOOL = 'ma-tool',
  BI_PAYMENT = 'bi-payment',
}

export enum MaToolTemplatesWorkstepTypeEnum {
  PREPARE = 'prepare',
  RECON_DATA = 'recon_data',
  RECON_FEEDBACK = 'recon_feedback',
  EX_PREPARE = 'ex_prepare',
}

@Entity('ma_tool_templates')
export class MaToolTemplates {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  name?: string;
  @Column({ type: 'text', nullable: true })
  description?: string;
  @Column({ type: 'varchar', nullable: true })
  image_url?: string;
  @Column({ type: 'enum', enum: MaToolTemplatesUploadMethodEnum, nullable: true })
  upload_method?: MaToolTemplatesUploadMethodEnum;
  @Column({ type: 'enum', enum: MaToolTemplatesUploadDateFrequencyEnum, nullable: true })
  upload_date_frequency?: MaToolTemplatesUploadDateFrequencyEnum;
  @Column({ type: 'enum', enum: MaToolTemplatesExploitFrequencyEnum, nullable: true })
  exploit_frequency?: MaToolTemplatesExploitFrequencyEnum;
  @Column({ type: 'timestamp', nullable: true })
  exploit_date?: string;
  @Column({ type: 'enum', enum: MaToolTemplatesTemplateStatusEnum, nullable: true })
  template_status?: MaToolTemplatesTemplateStatusEnum;
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
  @Column({ type: 'boolean', nullable: true })
  is_convert?: boolean;
  @Column({ type: 'boolean', nullable: true })
  is_deleted?: boolean;
  @Column({ type: 'timestamp', nullable: true })
  deleted_at?: string;
  @Column({ nullable: true })
  workspace_id?: number;
  @ManyToOne(() => MaToolWorkspaces)
  @JoinColumn({ name: 'workspace_id' })
  workspace?: MaToolWorkspaces;
  @OneToMany(() => FeedbackUsersMaToolTemplates, (p) => p.ma_tool_templates)
  owners_links?: FeedbackUsersMaToolTemplates[];
  @OneToMany(() => FeedbackUsersMaToolTemplates, (p) => p.ma_tool_templates)
  uploaders_links?: FeedbackUsersMaToolTemplates[];
  @OneToMany(() => FeedbackUsersMaToolTemplates, (p) => p.ma_tool_templates)
  approvers_links?: FeedbackUsersMaToolTemplates[];
  // OneToMany inverse: sheet_templates -> MaToolSheetTemplates
  // OneToMany inverse: documents -> MaToolDocuments
  @Column({ nullable: true })
  template_created_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'template_created_by_id' })
  template_created_by?: FeedbackUsers;
  @Column({ nullable: true })
  template_updated_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'template_updated_by_id' })
  template_updated_by?: FeedbackUsers;
  // OneToMany inverse: histories -> MaToolTemplateHistories
  @Column({ nullable: true })
  approved_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'approved_by_id' })
  approved_by?: FeedbackUsers;
  @Column({ nullable: true })
  inactivated_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'inactivated_by_id' })
  inactivated_by?: FeedbackUsers;
  @Column({ nullable: true })
  activated_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'activated_by_id' })
  activated_by?: FeedbackUsers;
  @Column({ nullable: true })
  rejected_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'rejected_by_id' })
  rejected_by?: FeedbackUsers;
  @Column({ type: 'timestamp', nullable: true })
  sending_date?: string;
  @Column({ type: 'timestamp', nullable: true })
  ending_date?: string;
  @OneToMany(() => MaToolTemplatesMaToolWorkspaces, (p) => p.ma_tool_templates)
  exploit_workspaces_links?: MaToolTemplatesMaToolWorkspaces[];
  @Column({ type: 'text', nullable: true })
  reason?: string;
  @Column({ type: 'int', nullable: true })
  version?: number;
  @Column({ nullable: true })
  bi_payment_program_id?: number;
  @ManyToOne(() => BiPaymentPrograms)
  @JoinColumn({ name: 'bi_payment_program_id' })
  bi_payment_program?: BiPaymentPrograms;
  @Column({ type: 'enum', enum: MaToolTemplatesTemplateTypeEnum, nullable: true })
  template_type?: MaToolTemplatesTemplateTypeEnum;
  @Column({ type: 'enum', enum: MaToolTemplatesWorkstepTypeEnum, nullable: true })
  workstep_type?: MaToolTemplatesWorkstepTypeEnum;
  // OneToMany inverse: ma_tool_template_bookmarks -> MaToolTemplateBookmarks
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