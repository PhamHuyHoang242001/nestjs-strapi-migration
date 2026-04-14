import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BiPaymentPrograms } from './bi_payment_programs.entity';
import { FeedbackUsers } from './feedback_users.entity';
import { Admins } from './admins.entity';

export enum BiPaymentChecklistsTypeEnum {
  DATA_INPUT = 'data_input',
  OTHER = 'other',
  ALL = 'all',
}

export enum BiPaymentChecklistsChecklistStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('bi_payment_checklists')
export class BiPaymentChecklists {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'enum', enum: BiPaymentChecklistsTypeEnum, nullable: true })
  type?: BiPaymentChecklistsTypeEnum;
  @Column({ type: 'enum', enum: BiPaymentChecklistsChecklistStatusEnum, nullable: true })
  checklist_status?: BiPaymentChecklistsChecklistStatusEnum;
  @Column({ type: 'varchar', nullable: true })
  name?: string;
  @Column({ nullable: true })
  program_id?: number;
  @ManyToOne(() => BiPaymentPrograms)
  @JoinColumn({ name: 'program_id' })
  program?: BiPaymentPrograms;
  @Column({ type: 'int', nullable: true })
  version?: number;
  @Column({ nullable: true })
  checklist_created_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'checklist_created_by_id' })
  checklist_created_by?: FeedbackUsers;
  @Column({ nullable: true })
  checklist_updated_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'checklist_updated_by_id' })
  checklist_updated_by?: FeedbackUsers;
  // OneToMany inverse: ma_tool_documents -> MaToolDocuments
  // OneToMany inverse: bi_payment_other_files -> BiPaymentOtherFiles
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