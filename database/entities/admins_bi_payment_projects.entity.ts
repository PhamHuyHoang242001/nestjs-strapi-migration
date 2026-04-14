import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';
import { BiPaymentProjects } from './bi_payment_projects.entity';

@Entity('admins_bi_payment_projects')
export class AdminsBiPaymentProjects {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  admins_id: number;
  @ManyToOne(() => Admins)
  @JoinColumn({ name: 'admins_id' })
  admins?: Admins;

  @Column({ nullable: false })
  bi_payment_projects_id: number;
  @ManyToOne(() => BiPaymentProjects)
  @JoinColumn({ name: 'bi_payment_projects_id' })
  bi_payment_projects?: BiPaymentProjects;
}