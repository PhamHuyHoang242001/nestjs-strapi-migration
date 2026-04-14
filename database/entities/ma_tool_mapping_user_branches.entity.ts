import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { FeedbackUsers } from './feedback_users.entity';
import { MaToolBranchConfigs } from './ma_tool_branch_configs.entity';
import { Admins } from './admins.entity';

@Entity('ma_tool_mapping_user_branches')
export class MaToolMappingUserBranches {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'boolean', nullable: true })
  is_primary?: boolean;
  @Column({ nullable: true })
  user_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'user_id' })
  user?: FeedbackUsers;
  @Column({ nullable: true })
  branch_id?: number;
  @ManyToOne(() => MaToolBranchConfigs)
  @JoinColumn({ name: 'branch_id' })
  branch?: MaToolBranchConfigs;
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