import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

export enum MaToolLogDownloadFilesDownloadStatusEnum {
  COMPLETED = 'completed',
  FAILED = 'failed',
  PROCESSING = 'processing',
}

@Entity('ma_tool_log_download_files')
export class MaToolLogDownloadFiles {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'simple-json', nullable: true })
  user?: string;
  @Column({ type: 'simple-json', nullable: true })
  reports?: string;
  @Column({ type: 'varchar', nullable: true })
  filename?: string;
  @Column({ type: 'varchar', nullable: true })
  zip_file_path?: string;
  @Column({ type: 'enum', enum: MaToolLogDownloadFilesDownloadStatusEnum, nullable: true })
  download_status?: MaToolLogDownloadFilesDownloadStatusEnum;
  @Column({ type: 'text', nullable: true })
  error_message?: string;
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