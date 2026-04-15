import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { BiPaymentLogMergeFileStatus, BiPaymentLogMergeFileMode } from '@common/enums/bi-payment.enums';
import { Column, Entity } from 'typeorm';

// Log record for a file merge operation in BI Payment workflow
@Entity('bi_payment_log_merge_files')
export class BiPaymentLogMergeFile extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public name: string;

  @Column({ nullable: true, type: 'jsonb' })
  public documents: object;

  // user stored as json snapshot (per Strapi schema)
  @Column({ nullable: true, type: 'jsonb' })
  public user: object;

  @Column({ nullable: true, type: 'enum', enum: BiPaymentLogMergeFileStatus })
  public merge_status: BiPaymentLogMergeFileStatus;

  @Column({ nullable: true })
  public destination_path: string;

  @Column({ nullable: true, type: 'enum', enum: BiPaymentLogMergeFileMode })
  public mode: BiPaymentLogMergeFileMode;
}
