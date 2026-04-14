import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { CmsRoleLogs } from './cms_role_logs.entity';
import { BiHubReportConfigs } from './bi_hub_report_configs.entity';
import { NotificationStats } from './notification_stats.entity';
import { BiHubLabelsUsers } from './bi_hub_labels_users.entity';
import { MaToolWorkspacesUsers } from './ma_tool_workspaces_users.entity';
import { MaToolTemplatesUsers } from './ma_tool_templates_users.entity';
import { BiPaymentProgramsUsers } from './bi_payment_programs_users.entity';
import { BiPaymentWorkStepsUsers } from './bi_payment_work_steps_users.entity';
import { BiPaymentProjectsUsers } from './bi_payment_projects_users.entity';
import { Admins } from './admins.entity';

export enum UsersLanguageEnum {
  VI = 'vi',
  EN = 'en',
}

@Entity('users')
export class Users {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: false })
  username?: string;
  @Column({ type: 'varchar', nullable: false })
  email?: string;
  @Column({ type: 'varchar', nullable: true })
  provider?: string;
  @Column({ type: 'varchar', nullable: true })
  password?: string;
  @Column({ type: 'varchar', nullable: true })
  reset_password_token?: string;
  @Column({ type: 'varchar', nullable: true })
  confirmation_token?: string;
  @Column({ type: 'boolean', nullable: true })
  confirmed?: boolean;
  @Column({ type: 'boolean', nullable: true })
  blocked?: boolean;
  @Column({ nullable: true })
  role_id?: number;
  @ManyToOne(() => CmsRoleLogs)
  @JoinColumn({ name: 'role_id' })
  role?: CmsRoleLogs;
  @Column({ type: 'varchar', nullable: true })
  city?: string;
  @Column({ type: 'varchar', nullable: true })
  branch_code?: string;
  @Column({ type: 'varchar', nullable: true })
  staff_id?: string;
  @Column({ type: 'varchar', nullable: true })
  emplm_contract_type?: string;
  // OneToMany inverse: jwt_tokens -> JwtTokens
  // OneToMany inverse: favourites -> BiHubFavourites
  // OneToMany inverse: ratings -> BiHubRatings
  // OneToMany inverse: comments -> BiHubReportComments
  // OneToMany inverse: tags -> BiHubTags
  @Column({ nullable: true })
  report_config_id?: number;
  @ManyToOne(() => BiHubReportConfigs)
  @JoinColumn({ name: 'report_config_id' })
  report_config?: BiHubReportConfigs;
  // OneToMany inverse: notifications -> AdminNotifications
  @Column({ nullable: true })
  notification_stat_id?: number;
  @ManyToOne(() => NotificationStats)
  @JoinColumn({ name: 'notification_stat_id' })
  notification_stat?: NotificationStats;
  @OneToMany(() => BiHubLabelsUsers, (p) => p.users)
  labels_links?: BiHubLabelsUsers[];
  @OneToMany(() => MaToolWorkspacesUsers, (p) => p.users)
  usable_workspaces_links?: MaToolWorkspacesUsers[];
  @OneToMany(() => MaToolWorkspacesUsers, (p) => p.users)
  approving_workspace_links?: MaToolWorkspacesUsers[];
  @OneToMany(() => MaToolTemplatesUsers, (p) => p.users)
  owned_templates_links?: MaToolTemplatesUsers[];
  @OneToMany(() => MaToolTemplatesUsers, (p) => p.users)
  uploadable_templates_links?: MaToolTemplatesUsers[];
  @OneToMany(() => MaToolTemplatesUsers, (p) => p.users)
  approving_templates_links?: MaToolTemplatesUsers[];
  // OneToMany inverse: ma_tool_template_creators -> MaToolTemplates
  // OneToMany inverse: ma_tool_template_updaters -> MaToolTemplates
  // OneToMany inverse: ma_tool_template_approvers -> MaToolTemplates
  // OneToMany inverse: ma_tool_inactivated_templates -> MaToolTemplates
  // OneToMany inverse: ma_tool_activate_templates -> MaToolTemplates
  // OneToMany inverse: ma_tool_rejected_templates -> MaToolTemplates
  // OneToMany inverse: ma_tool_document_creators -> MaToolDocuments
  // OneToMany inverse: ma_tool_documents_updaters -> MaToolDocuments
  // OneToMany inverse: sub_folders -> SubFolders
  // OneToMany inverse: workspace_bookmarks -> MaToolWorkspaceBookmarks
  // OneToMany inverse: ma_tool_template_histories_creators -> MaToolTemplateHistories
  // OneToMany inverse: ma_tool_template_histories_updaters -> MaToolTemplateHistories
  @OneToMany(() => BiPaymentProgramsUsers, (p) => p.users)
  programs_bicc_user_links?: BiPaymentProgramsUsers[];
  @OneToMany(() => BiPaymentProgramsUsers, (p) => p.users)
  programs_bu_user_links?: BiPaymentProgramsUsers[];
  // OneToMany inverse: bi_payment_checklists -> BiPaymentChecklists
  // OneToMany inverse: programs_created -> BiPaymentPrograms
  // OneToMany inverse: programs_updated -> BiPaymentPrograms
  @OneToMany(() => BiPaymentWorkStepsUsers, (p) => p.users)
  bi_payment_work_steps_links?: BiPaymentWorkStepsUsers[];
  @OneToMany(() => BiPaymentProjectsUsers, (p) => p.users)
  bi_payment_projects_links?: BiPaymentProjectsUsers[];
  // OneToMany inverse: bi_payment_comments -> BiPaymentComments
  // OneToMany inverse: program_log_changes -> BiPaymentProgramLogChanges
  // OneToMany inverse: program_histories_created -> BiPaymentProgramHistories
  // OneToMany inverse: program_histories_updated -> BiPaymentProgramHistories
  // OneToMany inverse: bi_payment_other_files -> BiPaymentOtherFiles
  // OneToMany inverse: bi_payment_program_pic_confirms -> BiPaymentProgramPicConfirms
  // OneToMany inverse: document_approvers -> MaToolDocuments
  // OneToMany inverse: document_rejecters -> MaToolDocuments
  // OneToMany inverse: mapping_user_branches -> MaToolMappingUserBranches
  @Column({ type: 'enum', enum: UsersLanguageEnum, nullable: true })
  language?: UsersLanguageEnum;
  // OneToMany inverse: ma_tool_template_bookmarks -> MaToolTemplateBookmarks
  // OneToMany inverse: ma_tool_data_service_center_bookmarks -> DataServiceCenterBookmarks
  // OneToMany inverse: feedback_users -> FeedbackUsers
  // OneToMany inverse: ma_tool_data_service_center_user_uses -> MaToolDataServiceCenterUserUses
  // OneToMany inverse: ma_tool_mapping_user_branch_histories -> MaToolMappingUserBranchHistories
  // OneToMany inverse: news_viewers -> NewsViewers
  // OneToMany inverse: created_data_self_serve_requests -> DataSelfServeRequests
  // OneToMany inverse: updated_data_self_serve_requests -> DataSelfServeRequests
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