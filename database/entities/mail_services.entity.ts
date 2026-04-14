import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

export enum MailServicesMailStatusEnum {
  INIT = 'init',
  PENDING = 'pending',
  FAILED = 'failed',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
}

export enum MailServicesClientTypeEnum {
  USER = 'user',
  ADMIN = 'admin',
}

@Entity('mail_services')
export class MailServices {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: false })
  from?: string;
  @Column({ type: 'text', nullable: false })
  to?: string;
  @Column({ type: 'varchar', nullable: false })
  subject?: string;
  @Column({ type: 'enum', enum: MailServicesMailStatusEnum, nullable: true })
  mail_status?: MailServicesMailStatusEnum;
  @Column({ type: 'enum', enum: MailServicesClientTypeEnum, nullable: true })
  client_type?: MailServicesClientTypeEnum;
  @Column({ type: 'varchar', nullable: false })
  template_id?: string;
  @Column({ type: 'simple-json', nullable: true })
  context?: string;
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