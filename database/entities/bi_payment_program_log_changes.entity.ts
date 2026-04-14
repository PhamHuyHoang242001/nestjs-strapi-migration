import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BiPaymentPrograms } from './bi_payment_programs.entity';
import { FeedbackUsers } from './feedback_users.entity';
import { BiPaymentProgramHistories } from './bi_payment_program_histories.entity';
import { Admins } from './admins.entity';

@Entity('bi_payment_program_log_changes')
export class BiPaymentProgramLogChanges {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'simple-json', nullable: true })
  change_log?: string;
  @Column({ nullable: true })
  program_id?: number;
  @ManyToOne(() => BiPaymentPrograms)
  @JoinColumn({ name: 'program_id' })
  program?: BiPaymentPrograms;
  @Column({ type: 'varchar', nullable: true })
  workstep?: string;
  @Column({ nullable: true })
  user_created_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'user_created_by_id' })
  user_created_by?: FeedbackUsers;
  @Column({ nullable: true })
  user_updated_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'user_updated_by_id' })
  user_updated_by?: FeedbackUsers;
  @Column({ type: 'boolean', nullable: true })
  is_change_link?: boolean;
  @Column({ nullable: true })
  program_history_id?: number;
  @ManyToOne(() => BiPaymentProgramHistories)
  @JoinColumn({ name: 'program_history_id' })
  program_history?: BiPaymentProgramHistories;
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