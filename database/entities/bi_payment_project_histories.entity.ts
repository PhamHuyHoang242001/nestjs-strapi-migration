import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BiPaymentProjects } from './bi_payment_projects.entity';
import { Admins } from './admins.entity';

@Entity('bi_payment_project_histories')
export class BiPaymentProjectHistories {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  project_id?: number;
  @ManyToOne(() => BiPaymentProjects)
  @JoinColumn({ name: 'project_id' })
  project?: BiPaymentProjects;
  @Column({ type: 'simple-json', nullable: true })
  change_log?: string;
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