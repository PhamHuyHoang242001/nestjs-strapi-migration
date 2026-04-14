import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BiPaymentWorkStepsFeedbackUsers } from './bi_payment_work_steps_feedback_users.entity';
import { BiPaymentProjects } from './bi_payment_projects.entity';
import { BiPaymentPrograms } from './bi_payment_programs.entity';
import { Admins } from './admins.entity';

export enum BiPaymentWorkStepsWorkStepEnum {
  CREATE_A_PROGRAM = 'create_a_program',
  PREPARING = 'preparing',
  CALCULATING = 'calculating',
  RECONCILIATION = 'reconciliation',
  EXCEPTION = 'exception',
  WAITING_FOR_APPROVAL = 'waiting_for_approval',
  RELEASE = 'release',
}

@Entity('bi_payment_work_steps')
export class BiPaymentWorkSteps {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'enum', enum: BiPaymentWorkStepsWorkStepEnum, nullable: true })
  work_step?: BiPaymentWorkStepsWorkStepEnum;
  @Column({ type: 'timestamp', nullable: true })
  starting_date?: string;
  @Column({ type: 'timestamp', nullable: true })
  ending_date?: string;
  @Column({ type: 'float', nullable: true })
  sla?: number;
  @OneToMany(() => BiPaymentWorkStepsFeedbackUsers, (p) => p.bi_payment_work_steps)
  user_ids_links?: BiPaymentWorkStepsFeedbackUsers[];
  @Column({ type: 'timestamp', nullable: true })
  bu_request_due_date?: string;
  @Column({ type: 'text', nullable: true })
  bu_request_reason?: string;
  @Column({ type: 'int', nullable: true })
  order?: number;
  @Column({ nullable: true })
  bi_payment_project_id?: number;
  @ManyToOne(() => BiPaymentProjects)
  @JoinColumn({ name: 'bi_payment_project_id' })
  bi_payment_project?: BiPaymentProjects;
  @Column({ nullable: true })
  program_id?: number;
  @ManyToOne(() => BiPaymentPrograms)
  @JoinColumn({ name: 'program_id' })
  program?: BiPaymentPrograms;
  @Column({ type: 'timestamp', nullable: true })
  bu_request_starting_date?: string;
  @Column({ type: 'timestamp', nullable: true })
  start_time?: string;
  @Column({ type: 'timestamp', nullable: true })
  end_time?: string;
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