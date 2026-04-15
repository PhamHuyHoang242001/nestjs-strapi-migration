import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { BiPaymentChecklistType, BiPaymentChecklistStatus } from '@common/enums/bi-payment.enums';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BiPaymentProgram } from '@modules/databases/bi-payment-program.entity';

// Checklist item attached to a BI Payment program
@Entity('bi_payment_checklists')
export class BiPaymentChecklist extends BaseSoftDeleteEntity {
  @Column({ nullable: true, type: 'enum', enum: BiPaymentChecklistType })
  public type: BiPaymentChecklistType;

  @Column({ nullable: true, type: 'enum', enum: BiPaymentChecklistStatus })
  public checklist_status: BiPaymentChecklistStatus;

  @Column({ nullable: true })
  public name: string;

  @Column({ nullable: true, type: 'int' })
  public version: number;

  // N:1 parent program
  @Column({ nullable: true, type: 'int' })
  public program_id: number;
  @ManyToOne(() => BiPaymentProgram, (p) => p.checklists)
  @JoinColumn({ name: 'program_id' })
  public program: BiPaymentProgram;

  // plain user FK stubs — no decorator
  @Column({ nullable: true, type: 'int' })
  public checklist_created_by_id: number;

  @Column({ nullable: true, type: 'int' })
  public checklist_updated_by_id: number;
}
