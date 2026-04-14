import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { MaToolDocuments } from './ma_tool_documents.entity';
import { BiPaymentChecklists } from './bi_payment_checklists.entity';
import { FeedbackUsers } from './feedback_users.entity';
import { Admins } from './admins.entity';

@Entity('bi_payment_other_files')
export class BiPaymentOtherFiles {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  file_media?: string;
  @Column({ type: 'varchar', nullable: true })
  file_url?: string;
  @Column({ type: 'varchar', nullable: true })
  name?: string;
  @Column({ type: 'varchar', nullable: true })
  type?: string;
  @Column({ type: 'int', nullable: true })
  version?: number;
  @Column({ nullable: true })
  bi_payment_document_id?: number;
  @ManyToOne(() => MaToolDocuments)
  @JoinColumn({ name: 'bi_payment_document_id' })
  bi_payment_document?: MaToolDocuments;
  @Column({ nullable: true })
  bi_payment_checklist_id?: number;
  @ManyToOne(() => BiPaymentChecklists)
  @JoinColumn({ name: 'bi_payment_checklist_id' })
  bi_payment_checklist?: BiPaymentChecklists;
  @Column({ type: 'varchar', nullable: true })
  file_size?: string;
  @Column({ nullable: true })
  orther_file_created_by_id?: number;
  @ManyToOne(() => FeedbackUsers)
  @JoinColumn({ name: 'orther_file_created_by_id' })
  orther_file_created_by?: FeedbackUsers;
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