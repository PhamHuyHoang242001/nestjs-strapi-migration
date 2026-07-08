import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import {
  MaToolFrequency,
  MaToolTemplateStatus,
  MaToolTemplateType,
  MaToolUploadMethod,
  MaToolWorkstepType,
} from '@common/enums/ma-tool.enums';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BiPaymentProgram } from './bi-payment-program.entity';
import { BiPaymentDocument } from './bi-payment-document.entity';

// Template bi-payment (tách khỏi ma_tool_templates). workstep_type drives file permission:
// prepare/ex_prepare → bp_program_preparing; recon_data → bp_program_reconciliation_sale (sale) OR _bicc;
// recon_feedback → bp_program_reconciliation_bicc.
@Entity('bi_payment_templates')
export class BiPaymentTemplate extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public name: string;

  @Column({ nullable: true, type: 'text' })
  public description: string;

  @Column({ nullable: true })
  public image_url: string;

  @Column({ nullable: true, type: 'enum', enum: MaToolUploadMethod })
  public upload_method: MaToolUploadMethod;

  @Column({ nullable: true, type: 'enum', enum: MaToolFrequency })
  public upload_date_frequency: MaToolFrequency;

  @Column({ nullable: true, type: 'enum', enum: MaToolFrequency })
  public exploit_frequency: MaToolFrequency;

  @Column({ nullable: true, type: 'date' })
  public exploit_date: Date;

  @Column({ nullable: true, type: 'enum', enum: MaToolTemplateStatus })
  public template_status: MaToolTemplateStatus;

  @Column({ nullable: true, type: 'enum', enum: MaToolWorkstepType })
  public workstep_type: MaToolWorkstepType;

  @Column({ nullable: true, type: 'enum', enum: MaToolTemplateType })
  public template_type: MaToolTemplateType;

  @Column({ nullable: true, type: 'date' })
  public request_active_at: Date;

  @Column({ nullable: true, type: 'date' })
  public approved_at: Date;

  @Column({ nullable: true, type: 'date' })
  public activated_at: Date;

  @Column({ nullable: true, type: 'date' })
  public inactivated_at: Date;

  @Column({ nullable: true, type: 'date' })
  public rejected_at: Date;

  @Column({ nullable: true, type: 'date' })
  public sending_date: Date;

  @Column({ nullable: true, type: 'date' })
  public ending_date: Date;

  @Column({ nullable: true, type: 'text' })
  public reason: string;

  @Column({ nullable: true, type: 'int' })
  public version: number;

  @Column({ nullable: true, default: false })
  public is_deleted?: boolean;

  @Column({ nullable: true, type: 'date' })
  public deleted_at_custom: Date;

  // FK program (scope anchor)
  @Column({ nullable: true, type: 'int' })
  public bi_payment_program_id: number;
  @ManyToOne(() => BiPaymentProgram, (p) => p.templates)
  @JoinColumn({ name: 'bi_payment_program_id' })
  public bi_payment_program: BiPaymentProgram;

  // 1:N — documents
  @OneToMany(() => BiPaymentDocument, (d) => d.template)
  public documents: BiPaymentDocument[];

  // plain user FK stubs — no decorator
  @Column({ nullable: true, type: 'int' })
  public template_created_by_id: number;

  @Column({ nullable: true, type: 'int' })
  public template_updated_by_id: number;
}
