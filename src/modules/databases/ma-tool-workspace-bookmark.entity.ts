import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Users } from './user.entity';
import { MaToolWorkspace } from './ma-tool-workspace.entity';
import { BaseColumn } from '@configuration/base-entity';

@Entity('ma_tool_workspace_bookmarks')
export class MaToolWorkspaceBookmark extends BaseColumn {
  @Column({ nullable: true })
  user_id: number;
  @ManyToOne(() => Users)
  @JoinColumn({ name: 'user_id' })
  user: Users;

  @Column({ nullable: true })
  workspace_id: number;
  @ManyToOne(() => MaToolWorkspace)
  @JoinColumn({ name: 'workspace_id' })
  workspace: MaToolWorkspace;
}
