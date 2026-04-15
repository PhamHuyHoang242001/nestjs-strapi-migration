import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BiPaymentProject } from '@modules/databases/bi-payment-project.entity';

// Audit snapshot of a BI Payment project state at a point in time
@Entity('bi_payment_project_histories')
export class BiPaymentProjectHistory extends BaseSoftDeleteEntity {
  @Column({ nullable: true, type: 'jsonb' })
  public change_log: object;

  // Audit diff columns (jsonb pattern)
  @Column({ nullable: true, type: 'jsonb' })
  public diff: object;

  @Column({ nullable: true, type: 'timestamptz' })
  public changed_at: Date;

  // N:1 parent project
  @Column({ nullable: true, type: 'int' })
  public project_id: number;
  @ManyToOne(() => BiPaymentProject, (p) => p.bi_payment_project_histories)
  @JoinColumn({ name: 'project_id' })
  public project: BiPaymentProject;

  // plain user FK — no decorator
  @Column({ nullable: true, type: 'int' })
  public user_id: number;
}
