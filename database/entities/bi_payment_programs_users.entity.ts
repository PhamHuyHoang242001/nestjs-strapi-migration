import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BiPaymentPrograms } from './bi_payment_programs.entity';
import { Users } from './users.entity';

@Entity('bi_payment_programs_users')
export class BiPaymentProgramsUsers {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  bi_payment_programs_id: number;
  @ManyToOne(() => BiPaymentPrograms)
  @JoinColumn({ name: 'bi_payment_programs_id' })
  bi_payment_programs?: BiPaymentPrograms;

  @Column({ nullable: false })
  users_id: number;
  @ManyToOne(() => Users)
  @JoinColumn({ name: 'users_id' })
  users?: Users;
}