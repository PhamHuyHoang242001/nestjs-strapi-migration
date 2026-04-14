import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BiPaymentPrograms } from './bi_payment_programs.entity';
import { FeedbackUsers } from './feedback_users.entity';

@Entity('bi_payment_programs_feedback_users')
export class BiPaymentProgramsFeedbackUsers {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  bi_payment_programs_id: number;
  @ManyToOne(() => BiPaymentPrograms)
  @JoinColumn({ name: 'bi_payment_programs_id' })
  bi_payment_programs?: BiPaymentPrograms;

  @Column({ nullable: false })
  feedback_users_id: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'feedback_users_id' })
  feedback_users?: FeedbackUsers;
}