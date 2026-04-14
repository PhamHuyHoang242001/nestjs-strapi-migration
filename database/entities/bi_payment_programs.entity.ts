import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BiPaymentProjects } from './bi_payment_projects.entity';
import { BiPaymentCategoriesBiPaymentPrograms } from './bi_payment_categories_bi_payment_programs.entity';
import { BiPaymentProgramsFeedbackUsers } from './bi_payment_programs_feedback_users.entity';
import { FeedbackUsers } from './feedback_users.entity';
import { Admins } from './admins.entity';

export enum BiPaymentProgramsCalculatingStatusEnum {
  NO_REVIEW = 'no_review',
  IN_REVIEW = 'in_review',
  APPROVED = 'approved',
}

export enum BiPaymentProgramsWorkstepCurrentEnum {
  CREATE_A_PROGRAM = 'create_a_program',
  PREPARING = 'preparing',
  CALCULATING = 'calculating',
  RECONCILIATION = 'reconciliation',
  EXCEPTION = 'exception',
  WAITING_FOR_APPROVAL = 'waiting_for_approval',
  RELEASE = 'release',
}

export enum BiPaymentProgramsProgramStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum BiPaymentProgramsProgressStatusEnum {
  COMPLETED = 'completed',
  OVERDUE = 'overdue',
  INPROGRESS = 'inprogress',
  NOTSTARTED = 'notstarted',
}

export enum BiPaymentProgramsProgramTypeEnum {
  REGULAR = 'regular',
  ADHOC = 'adhoc',
}

@Entity('bi_payment_programs')
export class BiPaymentPrograms {
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
  @Column({ type: 'enum', enum: BiPaymentProgramsCalculatingStatusEnum, nullable: true })
  calculating_status?: BiPaymentProgramsCalculatingStatusEnum;
  @Column({ type: 'enum', enum: BiPaymentProgramsWorkstepCurrentEnum, nullable: true })
  workstep_current?: BiPaymentProgramsWorkstepCurrentEnum;
  @Column({ type: 'enum', enum: BiPaymentProgramsProgramStatusEnum, nullable: true })
  program_status?: BiPaymentProgramsProgramStatusEnum;
  @Column({ type: 'enum', enum: BiPaymentProgramsProgressStatusEnum, nullable: true })
  progress_status?: BiPaymentProgramsProgressStatusEnum;
  @Column({ type: 'timestamp', nullable: true })
  expected_starting_date?: string;
  @Column({ type: 'timestamp', nullable: true })
  expected_ending_date?: string;
  @Column({ type: 'timestamp', nullable: true })
  request_duedate?: string;
  @Column({ type: 'varchar', nullable: true })
  request_reason?: string;
  @Column({ type: 'enum', enum: BiPaymentProgramsProgramTypeEnum, nullable: true })
  program_type?: BiPaymentProgramsProgramTypeEnum;
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
  @Column({ type: 'varchar', nullable: true })
  link_report_final?: string;
  @Column({ nullable: true })
  project_id?: number;
  @ManyToOne(() => BiPaymentProjects)
  @JoinColumn({ name: 'project_id' })
  project?: BiPaymentProjects;
  // OneToMany inverse: checklists -> BiPaymentChecklists
  @OneToMany(() => BiPaymentCategoriesBiPaymentPrograms, (p) => p.bi_payment_programs)
  bi_payment_categories_links?: BiPaymentCategoriesBiPaymentPrograms[];
  @OneToMany(() => BiPaymentProgramsFeedbackUsers, (p) => p.bi_payment_programs)
  bicc_users_links?: BiPaymentProgramsFeedbackUsers[];
  @OneToMany(() => BiPaymentProgramsFeedbackUsers, (p) => p.bi_payment_programs)
  bu_users_links?: BiPaymentProgramsFeedbackUsers[];
  // OneToMany inverse: templates -> MaToolTemplates
  @Column({ nullable: true })
  program_created_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'program_created_by_id' })
  program_created_by?: FeedbackUsers;
  @Column({ nullable: true })
  program_updated_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'program_updated_by_id' })
  program_updated_by?: FeedbackUsers;
  @Column({ type: 'varchar', nullable: true })
  requester_unit?: string;
  @Column({ type: 'boolean', nullable: true })
  is_deleted?: boolean;
  @Column({ type: 'boolean', nullable: true })
  is_apply_upfile_preparing_data?: boolean;
  // OneToMany inverse: work_steps -> BiPaymentWorkSteps
  // OneToMany inverse: comments -> BiPaymentComments
  @Column({ type: 'timestamp', nullable: true })
  preparing_up_file_starting_date?: string;
  @Column({ type: 'timestamp', nullable: true })
  preparing_up_file_ending_date?: string;
  @Column({ type: 'timestamp', nullable: true })
  issue_file_starting_date?: string;
  @Column({ type: 'timestamp', nullable: true })
  issue_file_ending_date?: string;
  // OneToMany inverse: program_histories -> BiPaymentProgramHistories
  // OneToMany inverse: program_log_changes -> BiPaymentProgramLogChanges
  @Column({ type: 'timestamp', nullable: true })
  calculating_ending_date?: string;
  @Column({ type: 'timestamp', nullable: true })
  calculating_starting_date?: string;
  @Column({ type: 'simple-json', nullable: true })
  frequencies?: string;
  // OneToMany inverse: bi_payment_program_pic_confirms -> BiPaymentProgramPicConfirms
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