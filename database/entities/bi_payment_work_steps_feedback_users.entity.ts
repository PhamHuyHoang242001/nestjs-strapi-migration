import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BiPaymentWorkSteps } from './bi_payment_work_steps.entity';
import { FeedbackUsers } from './feedback_users.entity';

@Entity('bi_payment_work_steps_feedback_users')
export class BiPaymentWorkStepsFeedbackUsers {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  bi_payment_work_steps_id: number;
  @ManyToOne(() => BiPaymentWorkSteps)
  @JoinColumn({ name: 'bi_payment_work_steps_id' })
  bi_payment_work_steps?: BiPaymentWorkSteps;

  @Column({ nullable: false })
  feedback_users_id: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'feedback_users_id' })
  feedback_users?: FeedbackUsers;
}