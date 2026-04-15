import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { MaToolBranchConfig } from './ma-tool-branch-config.entity';
import { MaToolMappingUserBranchHistory } from './ma-tool-mapping-user-branch-history.entity';

// Mapping between a user and a branch configuration for MA Tool access control
@Entity('ma_tool_mapping_user_branches')
export class MaToolMappingUserBranch extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public mapping_status: string;

  // user_id: plain nullable int, no decorator
  @Column({ nullable: true, type: 'int' })
  public user_id: number;

  // FK to ma_tool_branch_configs
  @Column({ nullable: false, type: 'int' })
  public branch_id: number;

  @ManyToOne(() => MaToolBranchConfig)
  @JoinColumn({ name: 'branch_id' })
  public branch: MaToolBranchConfig;

  // Reverse: audit history for this mapping
  @OneToMany(() => MaToolMappingUserBranchHistory, (h) => h.mapping)
  public histories: MaToolMappingUserBranchHistory[];
}
