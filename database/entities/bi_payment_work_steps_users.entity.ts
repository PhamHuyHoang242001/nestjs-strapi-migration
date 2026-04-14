import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BiPaymentWorkSteps } from './bi_payment_work_steps.entity';
import { Users } from './users.entity';

@Entity('bi_payment_work_steps_users')
export class BiPaymentWorkStepsUsers {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  bi_payment_work_steps_id: number;
  @ManyToOne(() => BiPaymentWorkSteps)
  @JoinColumn({ name: 'bi_payment_work_steps_id' })
  bi_payment_work_steps?: BiPaymentWorkSteps;

  @Column({ nullable: false })
  users_id: number;
  @ManyToOne(() => Users)
  @JoinColumn({ name: 'users_id' })
  users?: Users;
}