import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { BiPaymentProjectStatus, BiPaymentProgramType } from '@common/enums/bi-payment.enums';
import { Column, Entity, JoinTable, ManyToMany, OneToMany } from 'typeorm';
import { BiPaymentCategory } from '@modules/databases/bi-payment-category.entity';
import { BiPaymentProgram } from '@modules/databases/bi-payment-program.entity';
import { BiPaymentProjectHistory } from '@modules/databases/bi-payment-project-history.entity';
import { BiPaymentWorkStep } from '@modules/databases/bi-payment-work-step.entity';

// BI Payment project — top-level container; programs hang off this
@Entity('bi_payment_projects')
export class BiPaymentProject extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public project_code: string;

  @Column({ nullable: true })
  public project_name: string;

  @Column({ nullable: true })
  public description: string;

  @Column({ nullable: true, type: 'enum', enum: BiPaymentProgramType })
  public project_type: BiPaymentProgramType;

  @Column({ nullable: true, type: 'timestamptz' })
  public expected_starting_date: Date;

  @Column({ nullable: true, type: 'timestamptz' })
  public expected_ending_date: Date;

  @Column({ nullable: true, type: 'enum', enum: BiPaymentProjectStatus })
  public project_status: BiPaymentProjectStatus;

  @Column({ nullable: true, type: 'text' })
  public bicc_pic: string;

  @Column({ nullable: true, type: 'text' })
  public bu_pic: string;

  @Column({ nullable: true, type: 'text' })
  public requester: string;

  @Column({ nullable: true, type: 'text' })
  public requester_unit: string;

  @Column({ nullable: true, type: 'jsonb' })
  public files: object;

  @Column({ nullable: true, type: 'jsonb' })
  public frequencies: object;

  @Column({ nullable: true, default: false })
  public is_deleted: boolean;

  // M:N — categories (join table: bi_payment_projects_categories)
  @ManyToMany(() => BiPaymentCategory)
  @JoinTable({ name: 'bi_payment_projects_categories' })
  public categories: BiPaymentCategory[];

  // 1:N — programs
  @OneToMany(() => BiPaymentProgram, (p) => p.project)
  public programs: BiPaymentProgram[];

  // 1:N — work steps
  @OneToMany(() => BiPaymentWorkStep, (ws) => ws.bi_payment_project)
  public work_steps: BiPaymentWorkStep[];

  // 1:N — project histories
  @OneToMany(() => BiPaymentProjectHistory, (h) => h.project)
  public bi_payment_project_histories: BiPaymentProjectHistory[];

  // FK to users — plain nullable int, no decorator
  @Column({ nullable: true, type: 'int' })
  public user_id: number;
}
