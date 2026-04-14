import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { FeedbackUsers } from './feedback_users.entity';
import { MaToolWorkspaces } from './ma_tool_workspaces.entity';

@Entity('feedback_users_ma_tool_workspaces')
export class FeedbackUsersMaToolWorkspaces {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  feedback_users_id: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'feedback_users_id' })
  feedback_users?: FeedbackUsers;

  @Column({ nullable: false })
  ma_tool_workspaces_id: number;
  @ManyToOne(() => MaToolWorkspaces)
  @JoinColumn({ name: 'ma_tool_workspaces_id' })
  ma_tool_workspaces?: MaToolWorkspaces;
}