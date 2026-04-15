import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BiPaymentProgram } from '@modules/databases/bi-payment-program.entity';

// Granular field-level change log for a BI Payment program
@Entity('bi_payment_program_log_changes')
export class BiPaymentProgramLogChange extends BaseSoftDeleteEntity {
  @Column({ nullable: true, type: 'jsonb' })
  public change_log: object;

  @Column({ nullable: true })
  public workstep: string;

  @Column({ nullable: true, default: false })
  public is_change_link: boolean;

  // Audit diff columns (jsonb pattern)
  @Column({ nullable: true, type: 'jsonb' })
  public diff: object;

  @Column({ nullable: true, type: 'timestamptz' })
  public changed_at: Date;

  // N:1 parent program
  @Column({ nullable: true, type: 'int' })
  public program_id: number;
  @ManyToOne(() => BiPaymentProgram, (p) => p.program_log_changes)
  @JoinColumn({ name: 'program_id' })
  public program: BiPaymentProgram;

  // plain user FK stubs — no decorator
  @Column({ nullable: true, type: 'int' })
  public user_created_by_id: number;

  @Column({ nullable: true, type: 'int' })
  public user_updated_by_id: number;

  // plain program history FK — no decorator
  @Column({ nullable: true, type: 'int' })
  public program_history_id: number;
}
