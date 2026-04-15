import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { MaToolStorageType, MaToolWorkspaceStatus } from '@common/enums/ma-tool.enums';
import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany } from 'typeorm';
import { MaToolS3 } from './ma-tool-s3.entity';
import { MaToolTemplate } from './ma-tool-template.entity';
import { MaToolWorkspaceBookmark } from './ma-tool-workspace-bookmark.entity';
import { MaToolWorkspaceHistory } from './ma-tool-workspace-history.entity';

// MA Tool workspace — top-level container grouping templates and members
@Entity('ma_tool_workspaces')
export class MaToolWorkspace extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public name: string;

  @Column({ nullable: true })
  public fullname: string;

  @Column({ nullable: true, type: 'text' })
  public description: string;

  @Column({ nullable: true })
  public image_url: string;

  @Column({ nullable: true, type: 'enum', enum: MaToolWorkspaceStatus })
  public workspace_status: MaToolWorkspaceStatus;

  @Column({ nullable: true, type: 'enum', enum: MaToolStorageType })
  public storage_type: MaToolStorageType;

  @Column({ nullable: true })
  public is_deleted: boolean;

  // FK to ma_tool_s3 (nullable)
  @Column({ nullable: true, type: 'int' })
  public s3_id: number;

  @ManyToOne(() => MaToolS3, (s3) => s3.workspaces)
  @JoinColumn({ name: 's3_id' })
  public s3: MaToolS3;

  // M:N with MaToolTemplate — workspace owns the join table
  @ManyToMany(() => MaToolTemplate, (t) => t.workspaces)
  @JoinTable({ name: 'ma_tool_workspaces_templates' })
  public templates: MaToolTemplate[];

  // M:N sharing templates (separate join table)
  @ManyToMany(() => MaToolTemplate, (t) => t.exploit_workspaces)
  @JoinTable({ name: 'ma_tool_workspaces_sharing_templates' })
  public sharing_templates: MaToolTemplate[];

  // M:N allowed users — user_id only (plain int junction); stored as separate join table
  // user_id references are kept as plain int; no User entity relation

  // Reverse relations
  @OneToMany(() => MaToolWorkspaceBookmark, (b) => b.workspace)
  public workspace_bookmarks: MaToolWorkspaceBookmark[];

  @OneToMany(() => MaToolWorkspaceHistory, (h) => h.workspace)
  public workspace_histories: MaToolWorkspaceHistory[];
}
