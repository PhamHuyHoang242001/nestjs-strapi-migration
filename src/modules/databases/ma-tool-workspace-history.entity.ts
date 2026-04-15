import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MaToolWorkspace } from './ma-tool-workspace.entity';

// Audit history record for MA Tool workspace changes
@Entity('ma_tool_workspace_histories')
export class MaToolWorkspaceHistory extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public action: string;

  @Column({ nullable: true })
  public action_by: string;

  @Column({ nullable: true, type: 'timestamp without time zone' })
  public action_at: Date;

  @Column({ nullable: true, type: 'jsonb' })
  public old_value: object;

  @Column({ nullable: true, type: 'jsonb' })
  public new_value: object;

  // FK to ma_tool_workspaces
  @Column({ nullable: false, type: 'int' })
  public workspace_id: number;

  @ManyToOne(() => MaToolWorkspace, (w) => w.workspace_histories)
  @JoinColumn({ name: 'workspace_id' })
  public workspace: MaToolWorkspace;

  // user_id: plain nullable int, no decorator
  @Column({ nullable: true, type: 'int' })
  public user_id: number;
}
