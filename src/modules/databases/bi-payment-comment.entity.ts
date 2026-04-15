import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { BiPaymentWorkstepCurrent } from '@common/enums/bi-payment.enums';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BiPaymentProgram } from '@modules/databases/bi-payment-program.entity';

// Comment thread entry on a BI Payment program
@Entity('bi_payment_comments')
export class BiPaymentComment extends BaseSoftDeleteEntity {
  @Column({ nullable: true, type: 'text' })
  public value: string;

  @Column({ nullable: true, type: 'jsonb' })
  public files: object;

  @Column({ nullable: true, type: 'enum', enum: BiPaymentWorkstepCurrent })
  public workstep: BiPaymentWorkstepCurrent;

  @Column({ nullable: true, type: 'int' })
  public version: number;

  // N:1 parent program
  @Column({ nullable: true, type: 'int' })
  public program_id: number;
  @ManyToOne(() => BiPaymentProgram, (p) => p.comments)
  @JoinColumn({ name: 'program_id' })
  public program: BiPaymentProgram;

  // plain user FK — no decorator
  @Column({ nullable: true, type: 'int' })
  public user_created_by_id: number;

  // plain program history FK — no decorator
  @Column({ nullable: true, type: 'int' })
  public program_history_id: number;
}
