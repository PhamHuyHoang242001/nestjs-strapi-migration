import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Category classification for BI Payment projects and programs
@Entity('bi_payment_categories')
export class BiPaymentCategory extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;

  @Column({ nullable: true })
  public code: string;
}
