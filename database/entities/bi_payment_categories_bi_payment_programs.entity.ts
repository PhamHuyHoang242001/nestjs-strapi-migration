import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BiPaymentCategories } from './bi_payment_categories.entity';
import { BiPaymentPrograms } from './bi_payment_programs.entity';

@Entity('bi_payment_categories_bi_payment_programs')
export class BiPaymentCategoriesBiPaymentPrograms {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  bi_payment_categories_id: number;
  @ManyToOne(() => BiPaymentCategories)
  @JoinColumn({ name: 'bi_payment_categories_id' })
  bi_payment_categories?: BiPaymentCategories;

  @Column({ nullable: false })
  bi_payment_programs_id: number;
  @ManyToOne(() => BiPaymentPrograms)
  @JoinColumn({ name: 'bi_payment_programs_id' })
  bi_payment_programs?: BiPaymentPrograms;
}