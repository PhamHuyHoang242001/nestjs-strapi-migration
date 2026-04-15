import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BiPaymentProgram } from '@modules/databases/bi-payment-program.entity';

// PIC (person-in-charge) confirmation record for a BI Payment program step
@Entity('bi_payment_program_pic_confirms')
export class BiPaymentProgramPicConfirm extends BaseSoftDeleteEntity {
  @Column({ nullable: true, default: false })
  public is_approval: boolean;

  // Audit diff columns (jsonb pattern)
  @Column({ nullable: true, type: 'jsonb' })
  public diff: object;

  @Column({ nullable: true, type: 'timestamptz' })
  public changed_at: Date;

  // N:1 parent program
  @Column({ nullable: true, type: 'int' })
  public bi_payment_program_id: number;
  @ManyToOne(() => BiPaymentProgram, (p) => p.bi_payment_program_pic_confirms)
  @JoinColumn({ name: 'bi_payment_program_id' })
  public bi_payment_program: BiPaymentProgram;

  // plain user FK — no decorator
  @Column({ nullable: true, type: 'int' })
  public bi_payment_user_confirm_id: number;
}
