import { Entity, Column, ManyToOne, OneToMany, JoinColumn, ManyToMany } from 'typeorm';
import { BaseAuthorUserSoftDeleteColumn } from '@configuration/base-entity/base-author-user-soft-delete-column.entity';
import { MaToolS3 } from './ma-tool-s3.entity';
import { MaToolWorkspaceHistory } from './ma-tool-workspace-history.entity';
import { MaToolTemplate } from './ma-tool-template.entity';
import { MaToolWorkspaceBookmark } from './ma-tool-workspace-bookmark.entity';

export enum MaToolWorkspaceStorageTypeEnum {
  S3 = 's3',
  SFTP = 'sftp',
}

export enum MaToolWorkspaceStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('ma_tool_workspaces')
export class MaToolWorkspace extends BaseAuthorUserSoftDeleteColumn {
  @Column({ type: 'varchar', nullable: true })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  fullname: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', nullable: true })
  image_url: string;

  @Column({ nullable: true })
  status: MaToolWorkspaceStatusEnum;

  @Column({ nullable: true })
  storage_type: MaToolWorkspaceStorageTypeEnum;

  @OneToMany(() => MaToolTemplate, (t) => t.workspace)
  templates: MaToolTemplate[];

  @ManyToMany(() => MaToolTemplate, (p) => p.exploit_workspaces)
  sharing_templates: MaToolTemplate[];

  @Column({ nullable: true })
  s3_id: number;
  @ManyToOne(() => MaToolS3)
  @JoinColumn({ name: 's3_id' })
  s3: MaToolS3;

  @OneToMany(() => MaToolWorkspaceHistory, (p) => p.workspace)
  ma_tool_workspace_histories: MaToolWorkspaceHistory[];

  @OneToMany(() => MaToolWorkspaceBookmark, (wsb) => wsb.workspace)
  workspace_bookmarks: MaToolWorkspaceBookmark;
}
