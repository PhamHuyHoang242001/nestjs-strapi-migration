import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MaToolMappingUserBranch } from './ma-tool-mapping-user-branch.entity';

// Audit history for changes to a user-branch mapping in MA Tool
@Entity('ma_tool_mapping_user_branch_histories')
export class MaToolMappingUserBranchHistory extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public action: string;

  @Column({ nullable: true, type: 'timestamp without time zone' })
  public action_at: Date;

  // FK to ma_tool_mapping_user_branches
  @Column({ nullable: false, type: 'int' })
  public mapping_id: number;

  @ManyToOne(() => MaToolMappingUserBranch, (m) => m.histories)
  @JoinColumn({ name: 'mapping_id' })
  public mapping: MaToolMappingUserBranch;
}
