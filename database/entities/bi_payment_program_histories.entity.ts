import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BiPaymentPrograms } from './bi_payment_programs.entity';
import { FeedbackUsers } from './feedback_users.entity';
import { Admins } from './admins.entity';

export enum BiPaymentProgramHistoriesWorkstepCurrentEnum {
  CREATE_A_PROGRAM = 'create_a_program',
  PREPARING = 'preparing',
  CALCULATING = 'calculating',
  RECONCILIATION = 'reconciliation',
  EXCEPTION = 'exception',
  WAITING_FOR_APPROVAL = 'waiting_for_approval',
  RELEASE = 'release',
}

export enum BiPaymentProgramHistoriesFrequencyEnum {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  SEMI_ANNUAL = 'semi-annual',
}

export enum BiPaymentProgramHistoriesProgramStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum BiPaymentProgramHistoriesProgressStatusEnum {
  COMPLETED = 'completed',
  OVERDUE = 'overdue',
  INPROGRESS = 'inprogress',
  NOTSTARTED = 'notstarted',
}

export enum BiPaymentProgramHistoriesProgramTypeEnum {
  REGULAR = 'regular',
  ADHOC = 'adhoc',
}

@Entity('bi_payment_program_histories')
export class BiPaymentProgramHistories {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  name?: string;
  @Column({ type: 'varchar', nullable: true })
  code?: string;
  @Column({ type: 'varchar', nullable: true })
  description?: string;
  @Column({ type: 'int', nullable: true })
  version?: number;
  @Column({ type: 'enum', enum: BiPaymentProgramHistoriesWorkstepCurrentEnum, nullable: true })
  workstep_current?: BiPaymentProgramHistoriesWorkstepCurrentEnum;
  @Column({ type: 'enum', enum: BiPaymentProgramHistoriesFrequencyEnum, nullable: true })
  frequency?: BiPaymentProgramHistoriesFrequencyEnum;
  @Column({ type: 'enum', enum: BiPaymentProgramHistoriesProgramStatusEnum, nullable: true })
  program_status?: BiPaymentProgramHistoriesProgramStatusEnum;
  @Column({ type: 'enum', enum: BiPaymentProgramHistoriesProgressStatusEnum, nullable: true })
  progress_status?: BiPaymentProgramHistoriesProgressStatusEnum;
  @Column({ type: 'timestamp', nullable: true })
  expected_starting_date?: string;
  @Column({ type: 'timestamp', nullable: true })
  expected_ending_date?: string;
  @Column({ type: 'timestamp', nullable: true })
  request_duedate?: string;
  @Column({ type: 'varchar', nullable: true })
  request_reason?: string;
  @Column({ type: 'enum', enum: BiPaymentProgramHistoriesProgramTypeEnum, nullable: true })
  program_type?: BiPaymentProgramHistoriesProgramTypeEnum;
  @Column({ type: 'varchar', nullable: true })
  requester?: string;
  @Column({ type: 'varchar', nullable: true })
  bicc_pic?: string;
  @Column({ type: 'varchar', nullable: true })
  bu_pic?: string;
  @Column({ type: 'varchar', nullable: true })
  bicc_supporter?: string;
  @Column({ type: 'varchar', nullable: true })
  calculating_report_link?: string;
  @Column({ type: 'varchar', nullable: true })
  feedback_link?: string;
  @Column({ type: 'simple-json', nullable: true })
  files?: string;
  @Column({ type: 'simple-json', nullable: true })
  checklists?: string;
  @Column({ type: 'simple-json', nullable: true })
  bi_payment_categories?: string;
  @Column({ type: 'simple-json', nullable: true })
  bicc_users?: string;
  @Column({ type: 'simple-json', nullable: true })
  bu_users?: string;
  @Column({ type: 'simple-json', nullable: true })
  pics_confirmations?: string;
  @Column({ type: 'simple-json', nullable: true })
  program_created_by?: string;
  @Column({ type: 'simple-json', nullable: true })
  program_updated_by?: string;
  @Column({ type: 'varchar', nullable: true })
  requester_unit?: string;
  @Column({ type: 'boolean', nullable: true })
  is_deleted?: boolean;
  @Column({ type: 'simple-json', nullable: true })
  sale_group_users?: string;
  @Column({ type: 'simple-json', nullable: true })
  work_steps?: string;
  // OneToMany inverse: comments -> BiPaymentComments
  @Column({ nullable: true })
  program_id?: number;
  @ManyToOne(() => BiPaymentPrograms)
  @JoinColumn({ name: 'program_id' })
  program?: BiPaymentPrograms;
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
  // OneToMany inverse: log_changes -> BiPaymentProgramLogChanges
  @Column({ type: 'timestamp', nullable: true })
  preparing_up_file_ending_date?: string;
  @Column({ type: 'timestamp', nullable: true })
  preparing_up_file_starting_date?: string;
  @Column({ type: 'timestamp', nullable: true })
  issue_file_ending_date?: string;
  @Column({ type: 'timestamp', nullable: true })
  issue_file_starting_date?: string;
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