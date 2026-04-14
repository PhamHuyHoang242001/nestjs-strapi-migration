import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

export enum BiPaymentLogMergeFilesMergeStatusEnum {
  COMPLETED = 'completed',
  FAILED = 'failed',
  PROCESSING = 'processing',
}

export enum BiPaymentLogMergeFilesModeEnum {
  CSV = 'csv',
  EXCEL = 'excel',
}

@Entity('bi_payment_log_merge_files')
export class BiPaymentLogMergeFiles {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  name?: string;
  @Column({ type: 'simple-json', nullable: true })
  documents?: string;
  @Column({ type: 'simple-json', nullable: true })
  user?: string;
  @Column({ type: 'enum', enum: BiPaymentLogMergeFilesMergeStatusEnum, nullable: true })
  merge_status?: BiPaymentLogMergeFilesMergeStatusEnum;
  @Column({ type: 'varchar', nullable: true })
  destination_path?: string;
  @Column({ type: 'enum', enum: BiPaymentLogMergeFilesModeEnum, nullable: true })
  mode?: BiPaymentLogMergeFilesModeEnum;
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