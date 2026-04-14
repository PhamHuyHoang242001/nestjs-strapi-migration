import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BiPaymentPrograms } from './bi_payment_programs.entity';
import { BiPaymentProgramHistories } from './bi_payment_program_histories.entity';
import { FeedbackUsers } from './feedback_users.entity';
import { Admins } from './admins.entity';

export enum BiPaymentCommentsWorkstepEnum {
  CREATE_A_PROGRAM = 'create_a_program',
  PREPARING = 'preparing',
  CALCULATING = 'calculating',
  RECONCILIATION = 'reconciliation',
  EXCEPTION = 'exception',
  WAITING_FOR_APPROVAL = 'waiting_for_approval',
  RELEASE = 'release',
}

@Entity('bi_payment_comments')
export class BiPaymentComments {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'text', nullable: true })
  value?: string;
  @Column({ type: 'simple-json', nullable: true })
  files?: string;
  @Column({ nullable: true })
  program_id?: number;
  @ManyToOne(() => BiPaymentPrograms)
  @JoinColumn({ name: 'program_id' })
  program?: BiPaymentPrograms;
  @Column({ type: 'enum', enum: BiPaymentCommentsWorkstepEnum, nullable: true })
  workstep?: BiPaymentCommentsWorkstepEnum;
  @Column({ nullable: true })
  program_history_id?: number;
  @ManyToOne(() => BiPaymentProgramHistories)
  @JoinColumn({ name: 'program_history_id' })
  program_history?: BiPaymentProgramHistories;
  @Column({ nullable: true })
  user_created_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'user_created_by_id' })
  user_created_by?: FeedbackUsers;
  @Column({ type: 'int', nullable: true })
  version?: number;
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