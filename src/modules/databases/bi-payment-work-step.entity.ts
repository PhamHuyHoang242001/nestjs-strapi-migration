import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BiPaymentProject } from '@modules/databases/bi-payment-project.entity';
import { BiPaymentProgram } from '@modules/databases/bi-payment-program.entity';

// Workflow step definition for BI Payment projects and programs
@Entity('bi_payment_work_steps')
export class BiPaymentWorkStep extends BaseSoftDeleteEntity {
  @Column({ nullable: true, type: 'int' })
  public step_order: number;

  @Column({ nullable: true })
  public step_name: string;

  @Column({ nullable: true })
  public step_status: string;

  @Column({ nullable: true, type: 'text' })
  public description: string;

  // N:1 parent project
  @Column({ nullable: true, type: 'int' })
  public bi_payment_project_id: number;
  @ManyToOne(() => BiPaymentProject, (p) => p.work_steps)
  @JoinColumn({ name: 'bi_payment_project_id' })
  public bi_payment_project: BiPaymentProject;

  // N:1 parent program
  @Column({ nullable: true, type: 'int' })
  public program_id: number;
  @ManyToOne(() => BiPaymentProgram, (p) => p.work_steps)
  @JoinColumn({ name: 'program_id' })
  public program: BiPaymentProgram;
}
