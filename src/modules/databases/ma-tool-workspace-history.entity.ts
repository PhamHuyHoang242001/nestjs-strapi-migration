import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseAuthorUserSoftDeleteColumn } from '@configuration/base-entity/base-author-user-soft-delete-column.entity';
import { MaToolWorkspace } from './ma-tool-workspace.entity';

@Entity('ma_tool_workspace_histories')
export class MaToolWorkspaceHistory extends BaseAuthorUserSoftDeleteColumn {
  @Column({ nullable: true })
  workspace_id: number;
  @ManyToOne(() => MaToolWorkspace)
  @JoinColumn({ name: 'workspace_id' })
  workspace: MaToolWorkspace;

  @Column({ type: 'json', nullable: true })
  change_log: any;
}
