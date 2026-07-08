import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BiPaymentProgram } from './bi-payment-program.entity';
import { BiPaymentChecklist } from './bi-payment-checklist.entity';
import { BiPaymentTemplate } from './bi-payment-template.entity';

// File bi-payment (tách khỏi ma_tool_documents). Template's workstep_type xác định step →
// permission yêu cầu (prepare/recon_data/recon_feedback/ex_prepare).
@Entity('bi_payment_documents')
export class BiPaymentDocument extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public document_code: string;

  @Column({ nullable: true })
  public document_name: string;

  @Column({ nullable: true, type: 'date' })
  public document_date: Date;

  @Column({ nullable: true })
  public document_status: string;

  @Column({ nullable: true, type: 'text' })
  public notes: string;

  @Column({ nullable: true })
  public file_url: string;

  @Column({ nullable: true })
  public file_size: string;

  // S3 / validation metadata (mirror Strapi ma_tool_documents)
  @Column({ nullable: true })
  public validation_status: string;

  @Column({ nullable: true })
  public s3_destination_path: string;

  @Column({ nullable: true })
  public s3_portal_destination_path: string;

  @Column({ nullable: true })
  public s3_upload_status: string;

  @Column({ nullable: true })
  public back_date_mode: string;

  @Column({ nullable: true })
  public back_date_type: string;

  @Column({ nullable: true, type: 'int' })
  public back_date_file_id: number;

  @Column({ nullable: true, type: 'timestamptz' })
  public back_date_time: Date;

  @Column({ nullable: true, default: false })
  public is_reuploaded: boolean;

  @Column({ nullable: true, type: 'int' })
  public version: number;

  // FK template bi-payment (bi_payment_templates). Template's workstep_type drives permission.
  @Column({ nullable: true, type: 'int' })
  public template_id: number;
  @ManyToOne(() => BiPaymentTemplate, (t) => t.documents)
  @JoinColumn({ name: 'template_id' })
  public template: BiPaymentTemplate;

  // FK program (scope anchor for data_access)
  @Column({ nullable: true, type: 'int' })
  public program_id: number;
  @ManyToOne(() => BiPaymentProgram, (p) => p.documents)
  @JoinColumn({ name: 'program_id' })
  public program: BiPaymentProgram;

  // Optional FK checklist (document có thể gắn checklist ở màn preparing)
  @Column({ nullable: true, type: 'int' })
  public bi_payment_checklist_id: number;
  @ManyToOne(() => BiPaymentChecklist)
  @JoinColumn({ name: 'bi_payment_checklist_id' })
  public bi_payment_checklist: BiPaymentChecklist;

  // plain user FK — no decorator
  @Column({ nullable: true, type: 'int' })
  public uploaded_by_id: number;

  @Column({ nullable: true, type: 'int' })
  public rejected_by_id: number;

  @Column({ nullable: true, type: 'timestamptz' })
  public rejected_at: Date;
}
