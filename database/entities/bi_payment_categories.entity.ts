import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BiPaymentCategoriesBiPaymentPrograms } from './bi_payment_categories_bi_payment_programs.entity';
import { BiPaymentCategoriesBiPaymentProjects } from './bi_payment_categories_bi_payment_projects.entity';
import { Admins } from './admins.entity';

@Entity('bi_payment_categories')
export class BiPaymentCategories {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  name?: string;
  @OneToMany(() => BiPaymentCategoriesBiPaymentPrograms, (p) => p.bi_payment_categories)
  bi_payment_programs_links?: BiPaymentCategoriesBiPaymentPrograms[];
  @OneToMany(() => BiPaymentCategoriesBiPaymentProjects, (p) => p.bi_payment_categories)
  bi_payment_projects_links?: BiPaymentCategoriesBiPaymentProjects[];
  @Column({ nullable: true })
  created_by?: number;
  @ManyToOne(() => Admins)
  @JoinColumn({ name: 'created_by' })
  created_by_admin?: Admins;
  @Column({ nullable: true })
  updated_by?: number;
  @ManyToOne(() => Admins)
  @JoinColumn({ name: 'updated_by' })
  updated_by_admin?: Admins;
}