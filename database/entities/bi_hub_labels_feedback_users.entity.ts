import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BiHubLabels } from './bi_hub_labels.entity';
import { FeedbackUsers } from './feedback_users.entity';

@Entity('bi_hub_labels_feedback_users')
export class BiHubLabelsFeedbackUsers {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  bi_hub_labels_id: number;
  @ManyToOne(() => BiHubLabels)
  @JoinColumn({ name: 'bi_hub_labels_id' })
  bi_hub_labels?: BiHubLabels;

  @Column({ nullable: false })
  feedback_users_id: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'feedback_users_id' })
  feedback_users?: FeedbackUsers;
}