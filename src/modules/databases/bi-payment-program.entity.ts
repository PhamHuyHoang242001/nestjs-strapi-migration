import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import {
  BiPaymentCalculatingStatus,
  BiPaymentWorkstepCurrent,
  BiPaymentProgramStatus,
  BiPaymentProgressStatus,
  BiPaymentProgramType,
} from '@common/enums/bi-payment.enums';
import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany } from 'typeorm';
import { BiPaymentCategory } from '@modules/databases/bi-payment-category.entity';
import { BiPaymentProject } from '@modules/databases/bi-payment-project.entity';
import { BiPaymentChecklist } from '@modules/databases/bi-payment-checklist.entity';
import { BiPaymentComment } from '@modules/databases/bi-payment-comment.entity';
import { BiPaymentProgramHistory } from '@modules/databases/bi-payment-program-history.entity';
import { BiPaymentProgramLogChange } from '@modules/databases/bi-payment-program-log-change.entity';
import { BiPaymentProgramPicConfirm } from '@modules/databases/bi-payment-program-pic-confirm.entity';
import { BiPaymentWorkStep } from '@modules/databases/bi-payment-work-step.entity';

// BI Payment program — child of project; owns checklists, comments, histories
@Entity('bi_payment_programs')
export class BiPaymentProgram extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public name: string;

  @Column({ nullable: true })
  public code: string;

  @Column({ nullable: true })
  public description: string;

  @Column({ nullable: true, type: 'int' })
  public version: number;

  @Column({ nullable: true, type: 'enum', enum: BiPaymentCalculatingStatus })
  public calculating_status: BiPaymentCalculatingStatus;

  @Column({ nullable: true, type: 'enum', enum: BiPaymentWorkstepCurrent })
  public workstep_current: BiPaymentWorkstepCurrent;

  @Column({ nullable: true, type: 'enum', enum: BiPaymentProgramStatus })
  public program_status: BiPaymentProgramStatus;

  @Column({ nullable: true, type: 'enum', enum: BiPaymentProgressStatus })
  public progress_status: BiPaymentProgressStatus;

  @Column({ nullable: true, type: 'datetime' })
  public expected_starting_date: Date;

  @Column({ nullable: true, type: 'datetime' })
  public expected_ending_date: Date;

  @Column({ nullable: true, type: 'datetime' })
  public request_duedate: Date;

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

  @Column({ nullable: true })
  public link_report_final: string;

  @Column({ nullable: true, type: 'jsonb' })
  public files: object;

  @Column({ nullable: true })
  public requester_unit: string;

  @Column({ nullable: true, default: false })
  public is_deleted: boolean;

  @Column({ nullable: true, default: true })
  public is_apply_upfile_preparing_data: boolean;

  @Column({ nullable: true, type: 'datetime' })
  public preparing_up_file_starting_date: Date;

  @Column({ nullable: true, type: 'datetime' })
  public preparing_up_file_ending_date: Date;

  @Column({ nullable: true, type: 'datetime' })
  public issue_file_starting_date: Date;

  @Column({ nullable: true, type: 'datetime' })
  public issue_file_ending_date: Date;

  @Column({ nullable: true, type: 'datetime' })
  public calculating_starting_date: Date;

  @Column({ nullable: true, type: 'datetime' })
  public calculating_ending_date: Date;

  @Column({ nullable: true, type: 'jsonb' })
  public frequencies: object;

  // N:1 parent project
  @Column({ nullable: true, type: 'int' })
  public project_id: number;
  @ManyToOne(() => BiPaymentProject, (p) => p.programs)
  @JoinColumn({ name: 'project_id' })
  public project: BiPaymentProject;

  // plain user FK stubs — no decorator per rules
  @Column({ nullable: true, type: 'int' })
  public program_created_by_id: number;

  @Column({ nullable: true, type: 'int' })
  public program_updated_by_id: number;

  // M:N — categories (join table: bi_payment_programs_categories)
  @ManyToMany(() => BiPaymentCategory)
  @JoinTable({ name: 'bi_payment_programs_categories' })
  public bi_payment_categories: BiPaymentCategory[];

  // 1:N children
  @OneToMany(() => BiPaymentWorkStep, (ws) => ws.program)
  public work_steps: BiPaymentWorkStep[];

  @OneToMany(() => BiPaymentChecklist, (c) => c.program)
  public checklists: BiPaymentChecklist[];

  @OneToMany(() => BiPaymentComment, (c) => c.program)
  public comments: BiPaymentComment[];

  @OneToMany(() => BiPaymentProgramHistory, (h) => h.program)
  public program_histories: BiPaymentProgramHistory[];

  @OneToMany(() => BiPaymentProgramLogChange, (lc) => lc.program)
  public program_log_changes: BiPaymentProgramLogChange[];

  @OneToMany(() => BiPaymentProgramPicConfirm, (pc) => pc.bi_payment_program)
  public bi_payment_program_pic_confirms: BiPaymentProgramPicConfirm[];
}
