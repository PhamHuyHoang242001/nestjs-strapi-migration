import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BiPaymentPrograms } from './bi_payment_programs.entity';
import { FeedbackUsers } from './feedback_users.entity';
import { Admins } from './admins.entity';

@Entity('bi_payment_program_pic_confirms')
export class BiPaymentProgramPicConfirms {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  bi_payment_program_id?: number;
  @ManyToOne(() => BiPaymentPrograms)
  @JoinColumn({ name: 'bi_payment_program_id' })
  bi_payment_program?: BiPaymentPrograms;
  @Column({ nullable: true })
  bi_payment_user_confirm_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'bi_payment_user_confirm_id' })
  bi_payment_user_confirm?: FeedbackUsers;
  @Column({ type: 'boolean', nullable: true })
  is_approval?: boolean;
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