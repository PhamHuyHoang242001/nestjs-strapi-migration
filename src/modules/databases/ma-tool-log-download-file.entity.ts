import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Log entry recording a report download/zip event from MA Tool SBV reports
@Entity('ma_tool_log_download_files')
export class MaToolLogDownloadFile extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public filename: string;

  @Column({ nullable: true })
  public zip_file_path: string;

  @Column({ nullable: true })
  public download_status: string;

  @Column({ nullable: true, type: 'text' })
  public error_message: string;

  // Strapi stores user info and report list as JSON blobs
  @Column({ nullable: true, type: 'jsonb' })
  public user: Record<string, any>;

  @Column({ nullable: true, type: 'jsonb' })
  public reports: Record<string, any>[];
}
