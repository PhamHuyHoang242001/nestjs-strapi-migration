import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DataSelfServeRequest } from './data-self-serve-request.entity';

@Entity('data_self_serve_validation_logs')
export class DataSelfServeValidationLog extends BaseSoftDeleteEntity {
  @Column({ type: 'int', nullable: true })
  total_column: number;

  @Column({ type: 'int', nullable: true })
  total_row: number;

  @Column({ type: 'jsonb', nullable: true })
  logs: Record<string, unknown>;

  @Column({ type: 'int', nullable: true })
  request_id: number;

  @ManyToOne(() => DataSelfServeRequest, (request) => request.validation_logs)
  @JoinColumn({ name: 'request_id' })
  request: DataSelfServeRequest;
}
