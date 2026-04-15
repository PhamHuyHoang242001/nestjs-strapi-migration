import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinTable, ManyToMany, OneToMany } from 'typeorm';
import { DataSelfServeSegment } from './data-self-serve-segment.entity';
import { DataSelfServeIndustry } from './data-self-serve-industry.entity';
import { DataSelfServeValidationLog } from './data-self-serve-validation-log.entity';

// User request for self-serve data access, linked to segments and industries
@Entity('data_self_serve_requests')
export class DataSelfServeRequest extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public request_status: string;

  @Column({ nullable: true })
  public request_group: string;

  @Column({ nullable: true })
  public validation_status: string;

  @Column({ nullable: true })
  public destination_path: string;

  @Column({ nullable: true })
  public backup_input_file_path: string;

  @Column({ nullable: true })
  public code: string;

  @Column({ nullable: true })
  public portal_file_url: string;

  @Column({ nullable: true })
  public input_method: string;

  @Column({ nullable: true })
  public file_size: string;

  @Column({ nullable: true })
  public source: string;

  @Column({ nullable: true })
  public storage_type: string;

  @Column({ nullable: true, type: 'int' })
  public estimated_completion_hours: number;

  @Column({ nullable: true, type: 'jsonb' })
  public request_params: Record<string, any>;

  @Column({ nullable: true, type: 'jsonb' })
  public response_body: Record<string, any>;

  @Column({ nullable: true, type: 'jsonb' })
  public rows_file_input: Record<string, any>;

  @Column({ nullable: true, type: 'timestamp' })
  public request_completed_at: Date;

  @Column({ nullable: true, type: 'text' })
  public short_description: string;

  // plain FKs; no User relation decorator
  @Column({ nullable: true, type: 'int' })
  public created_by_user_id: number;

  @Column({ nullable: true, type: 'int' })
  public updated_by_user_id: number;

  @ManyToMany(() => DataSelfServeSegment)
  @JoinTable({ name: 'data_self_serve_requests_segments' })
  public segments: DataSelfServeSegment[];

  @ManyToMany(() => DataSelfServeIndustry)
  @JoinTable({ name: 'data_self_serve_requests_industries' })
  public industries: DataSelfServeIndustry[];

  @OneToMany(() => DataSelfServeValidationLog, (l) => l.request)
  public validation_logs: DataSelfServeValidationLog[];
}
