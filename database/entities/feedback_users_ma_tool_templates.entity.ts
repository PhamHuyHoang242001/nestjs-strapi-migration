import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { FeedbackUsers } from './feedback_users.entity';
import { MaToolTemplates } from './ma_tool_templates.entity';

@Entity('feedback_users_ma_tool_templates')
export class FeedbackUsersMaToolTemplates {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  feedback_users_id: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'feedback_users_id' })
  feedback_users?: FeedbackUsers;

  @Column({ nullable: false })
  ma_tool_templates_id: number;
  @ManyToOne(() => MaToolTemplates)
  @JoinColumn({ name: 'ma_tool_templates_id' })
  ma_tool_templates?: MaToolTemplates;
}