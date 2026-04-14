import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { MaToolDocuments } from './ma_tool_documents.entity';
import { Admins } from './admins.entity';

@Entity('ma_tool_validation_logs')
export class MaToolValidationLogs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  sheet_name?: string;
  @Column({ type: 'int', nullable: true })
  total_column?: number;
  @Column({ type: 'int', nullable: true })
  total_row?: number;
  @Column({ type: 'int', nullable: true })
  order?: number;
  @Column({ type: 'simple-json', nullable: true })
  logs?: string;
  @Column({ nullable: true })
  document_id?: number;
  @ManyToOne(() => MaToolDocuments)
  @JoinColumn({ name: 'document_id' })
  document?: MaToolDocuments;
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