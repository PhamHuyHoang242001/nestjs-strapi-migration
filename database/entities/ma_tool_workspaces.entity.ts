import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { AdminsMaToolWorkspaces } from './admins_ma_tool_workspaces.entity';
import { FeedbackUsersMaToolWorkspaces } from './feedback_users_ma_tool_workspaces.entity';
import { MaToolTemplatesMaToolWorkspaces } from './ma_tool_templates_ma_tool_workspaces.entity';
import { MaToolS3s } from './ma_tool_s3s.entity';
import { Admins } from './admins.entity';

export enum MaToolWorkspacesWorkspaceStatusEnum {
  DRAFT = 'draft',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum MaToolWorkspacesStorageTypeEnum {
  S3 = 's3',
  SFTP = 'sftp',
}

@Entity('ma_tool_workspaces')
export class MaToolWorkspaces {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  name?: string;
  @Column({ type: 'varchar', nullable: true })
  fullname?: string;
  @Column({ type: 'text', nullable: true })
  description?: string;
  @Column({ type: 'varchar', nullable: true })
  image_url?: string;
  @Column({ type: 'enum', enum: MaToolWorkspacesWorkspaceStatusEnum, nullable: true })
  workspace_status?: MaToolWorkspacesWorkspaceStatusEnum;
  @Column({ type: 'enum', enum: MaToolWorkspacesStorageTypeEnum, nullable: true })
  storage_type?: MaToolWorkspacesStorageTypeEnum;
  @Column({ type: 'boolean', nullable: true })
  is_deleted?: boolean;
  @Column({ type: 'timestamp', nullable: true })
  deleted_at?: string;
  @OneToMany(() => AdminsMaToolWorkspaces, (p) => p.ma_tool_workspaces)
  admins_links?: AdminsMaToolWorkspaces[];
  @OneToMany(() => FeedbackUsersMaToolWorkspaces, (p) => p.ma_tool_workspaces)
  allowed_users_links?: FeedbackUsersMaToolWorkspaces[];
  @OneToMany(() => FeedbackUsersMaToolWorkspaces, (p) => p.ma_tool_workspaces)
  approvers_links?: FeedbackUsersMaToolWorkspaces[];
  // OneToMany inverse: templates -> MaToolTemplates
  @OneToMany(() => MaToolTemplatesMaToolWorkspaces, (p) => p.ma_tool_workspaces)
  sharing_templates_links?: MaToolTemplatesMaToolWorkspaces[];
  @Column({ nullable: true })
  s3_id?: number;
  @ManyToOne(() => MaToolS3s)
  @JoinColumn({ name: 's3_id' })
  s3?: MaToolS3s;
  // OneToMany inverse: workspace_bookmarks -> MaToolWorkspaceBookmarks
  // OneToMany inverse: ma_tool_workspace_histories -> MaToolWorkspaceHistories
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