import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BiPaymentProjects } from './bi_payment_projects.entity';
import { FeedbackUsers } from './feedback_users.entity';

@Entity('bi_payment_projects_feedback_users')
export class BiPaymentProjectsFeedbackUsers {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  bi_payment_projects_id: number;
  @ManyToOne(() => BiPaymentProjects)
  @JoinColumn({ name: 'bi_payment_projects_id' })
  bi_payment_projects?: BiPaymentProjects;

  @Column({ nullable: false })
  feedback_users_id: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'feedback_users_id' })
  feedback_users?: FeedbackUsers;
}