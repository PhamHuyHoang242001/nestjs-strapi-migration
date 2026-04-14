import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BiHubReports } from './bi_hub_reports.entity';
import { Admins } from './admins.entity';

@Entity('bi_hub_report_files')
export class BiHubReportFiles {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  file_media?: string;
  @Column({ type: 'varchar', nullable: true })
  file_url?: string;
  @Column({ type: 'varchar', nullable: true })
  type?: string;
  @Column({ type: 'varchar', nullable: true })
  name?: string;
  @Column({ type: 'boolean', nullable: true })
  lastest_version?: boolean;
  @Column({ nullable: true })
  bi_hub_report_id?: number;
  @ManyToOne(() => BiHubReports)
  @JoinColumn({ name: 'bi_hub_report_id' })
  bi_hub_report?: BiHubReports;
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