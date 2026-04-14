import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { FeedbackUsers } from './feedback_users.entity';
import { Admins } from './admins.entity';

@Entity('ma_tool_mapping_user_branch_histories')
export class MaToolMappingUserBranchHistories {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  users_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'users_id' })
  users?: FeedbackUsers;
  @Column({ type: 'simple-json', nullable: true })
  change_log?: string;
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