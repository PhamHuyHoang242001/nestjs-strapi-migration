import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MaToolWorkspace } from './ma-tool-workspace.entity';

// User bookmark for an MA Tool workspace
@Entity('ma_tool_workspace_bookmarks')
export class MaToolWorkspaceBookmark extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public is_bookmarked: boolean;

  // FK to ma_tool_workspaces
  @Column({ nullable: false, type: 'int' })
  public workspace_id: number;

  @ManyToOne(() => MaToolWorkspace, (w) => w.workspace_bookmarks)
  @JoinColumn({ name: 'workspace_id' })
  public workspace: MaToolWorkspace;

  // user_id: plain nullable int, no decorator
  @Column({ nullable: true, type: 'int' })
  public user_id: number;
}
