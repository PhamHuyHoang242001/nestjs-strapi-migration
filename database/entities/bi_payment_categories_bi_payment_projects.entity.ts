import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BiPaymentCategories } from './bi_payment_categories.entity';
import { BiPaymentProjects } from './bi_payment_projects.entity';

@Entity('bi_payment_categories_bi_payment_projects')
export class BiPaymentCategoriesBiPaymentProjects {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  bi_payment_categories_id: number;
  @ManyToOne(() => BiPaymentCategories)
  @JoinColumn({ name: 'bi_payment_categories_id' })
  bi_payment_categories?: BiPaymentCategories;

  @Column({ nullable: false })
  bi_payment_projects_id: number;
  @ManyToOne(() => BiPaymentProjects)
  @JoinColumn({ name: 'bi_payment_projects_id' })
  bi_payment_projects?: BiPaymentProjects;
}