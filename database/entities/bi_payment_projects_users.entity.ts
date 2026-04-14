import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BiPaymentProjects } from './bi_payment_projects.entity';
import { Users } from './users.entity';

@Entity('bi_payment_projects_users')
export class BiPaymentProjectsUsers {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  bi_payment_projects_id: number;
  @ManyToOne(() => BiPaymentProjects)
  @JoinColumn({ name: 'bi_payment_projects_id' })
  bi_payment_projects?: BiPaymentProjects;

  @Column({ nullable: false })
  users_id: number;
  @ManyToOne(() => Users)
  @JoinColumn({ name: 'users_id' })
  users?: Users;
}