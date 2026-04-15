import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { MaToolTemplate } from './ma-tool-template.entity';
import { MaToolLogDownloadFile } from './ma-tool-log-download-file.entity';

// Document attachment associated with an MA Tool template
@Entity('ma_tool_documents')
export class MaToolDocument extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public document_code: string;

  @Column({ nullable: true })
  public document_name: string;

  @Column({ nullable: true, type: 'date' })
  public document_date: Date;

  @Column({ nullable: true })
  public document_status: string;

  @Column({ nullable: true })
  public document_type: string;

  @Column({ nullable: true, type: 'text' })
  public notes: string;

  @Column({ nullable: true })
  public file_url: string;

  // FK to ma_tool_templates
  @Column({ nullable: false, type: 'int' })
  public template_id: number;

  @ManyToOne(() => MaToolTemplate, (t) => t.documents)
  @JoinColumn({ name: 'template_id' })
  public template: MaToolTemplate;

  // uploaded_by_id: plain nullable int, no decorator
  @Column({ nullable: true, type: 'int' })
  public uploaded_by_id: number;

  // Reverse: download logs for this document
  @OneToMany(() => MaToolLogDownloadFile, (l) => l.document)
  public download_logs: MaToolLogDownloadFile[];
}
