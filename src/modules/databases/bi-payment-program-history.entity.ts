import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import {
  BiPaymentWorkstepCurrent,
  BiPaymentProgramStatus,
  BiPaymentProgressStatus,
  BiPaymentProgramType,
  BiPaymentProgramFrequency,
} from '@common/enums/bi-payment.enums';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BiPaymentProgram } from '@modules/databases/bi-payment-program.entity';

// Audit snapshot of a BI Payment program state at a point in time
@Entity('bi_payment_program_histories')
export class BiPaymentProgramHistory extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public name: string;

  @Column({ nullable: true })
  public code: string;

  @Column({ nullable: true })
  public description: string;

  @Column({ nullable: true, type: 'int' })
  public version: number;

  @Column({ nullable: true, type: 'enum', enum: BiPaymentWorkstepCurrent })
  public workstep_current: BiPaymentWorkstepCurrent;

  @Column({ nullable: true, type: 'enum', enum: BiPaymentProgramFrequency })
  public frequency: BiPaymentProgramFrequency;

  @Column({ nullable: true, type: 'enum', enum: BiPaymentProgramStatus })
  public program_status: BiPaymentProgramStatus;

  @Column({ nullable: true, type: 'enum', enum: BiPaymentProgressStatus })
  public progress_status: BiPaymentProgressStatus;

  @Column({ nullable: true, type: 'date' })
  public expected_starting_date: string;

  @Column({ nullable: true, type: 'date' })
  public expected_ending_date: string;

  @Column({ nullable: true, type: 'date' })
  public request_duedate: string;

  @Column({ nullable: true })
  public request_reason: string;

  @Column({ nullable: true, type: 'enum', enum: BiPaymentProgramType })
  public program_type: BiPaymentProgramType;

  @Column({ nullable: true })
  public requester: string;

  @Column({ nullable: true })
  public bicc_pic: string;

  @Column({ nullable: true })
  public bu_pic: string;

  @Column({ nullable: true })
  public bicc_supporter: string;

  @Column({ nullable: true })
  public calculating_report_link: string;

  @Column({ nullable: true })
  public feedback_link: string;

  @Column({ nullable: true, type: 'jsonb' })
  public files: object;

  @Column({ nullable: true })
  public requester_unit: string;

  @Column({ nullable: true, default: false })
  public is_deleted: boolean;

  @Column({ nullable: true, type: 'datetime' })
  public preparing_up_file_starting_date: Date;

  @Column({ nullable: true, type: 'datetime' })
  public preparing_up_file_ending_date: Date;

  @Column({ nullable: true, type: 'datetime' })
  public issue_file_starting_date: Date;

  @Column({ nullable: true, type: 'datetime' })
  public issue_file_ending_date: Date;

  // Audit diff columns (jsonb pattern)
  @Column({ nullable: true, type: 'jsonb' })
  public diff: object;

  @Column({ nullable: true, type: 'datetime' })
  public changed_at: Date;

  // N:1 parent program
  @Column({ nullable: true, type: 'int' })
  public program_id: number;
  @ManyToOne(() => BiPaymentProgram, (p) => p.program_histories)
  @JoinColumn({ name: 'program_id' })
  public program: BiPaymentProgram;

  // plain user FK stubs — no decorator
  @Column({ nullable: true, type: 'int' })
  public user_created_by_id: number;

  @Column({ nullable: true, type: 'int' })
  public user_updated_by_id: number;
}
