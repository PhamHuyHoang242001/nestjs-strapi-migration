import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MaToolDocument } from './ma-tool-document.entity';

// Log entry recording a file download event from MA Tool document
@Entity('ma_tool_log_download_files')
export class MaToolLogDownloadFile extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public file_name: string;

  @Column({ nullable: true, type: 'date' })
  public download_date: Date;

  @Column({ nullable: true })
  public download_status: string;

  // FK to ma_tool_documents
  @Column({ nullable: false, type: 'int' })
  public document_id: number;

  @ManyToOne(() => MaToolDocument, (d) => d.download_logs)
  @JoinColumn({ name: 'document_id' })
  public document: MaToolDocument;

  // user_id: plain nullable int, no decorator
  @Column({ nullable: true, type: 'int' })
  public user_id: number;
}
