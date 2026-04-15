import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BiPaymentChecklist } from '@modules/databases/bi-payment-checklist.entity';

// Supplementary file attachment for a BI Payment checklist item
@Entity('bi_payment_other_files')
export class BiPaymentOtherFile extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public name: string;

  @Column({ nullable: true })
  public type: string;

  @Column({ nullable: true, type: 'int' })
  public version: number;

  // Flat media fields (Strapi file_media → flat columns)
  @Column({ nullable: true })
  public file_url: string;

  @Column({ nullable: true })
  public file_size: string;

  // N:1 parent checklist
  @Column({ nullable: true, type: 'int' })
  public bi_payment_checklist_id: number;
  @ManyToOne(() => BiPaymentChecklist)
  @JoinColumn({ name: 'bi_payment_checklist_id' })
  public bi_payment_checklist: BiPaymentChecklist;

  // plain user FK — no decorator
  @Column({ nullable: true, type: 'int' })
  public orther_file_created_by_id: number;
}
