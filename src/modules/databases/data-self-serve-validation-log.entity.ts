import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { DataSelfServeRequest } from './data-self-serve-request.entity';

// Log entry for each validation step of a data self-serve request
@Entity('data_self_serve_validation_logs')
export class DataSelfServeValidationLog extends BaseSoftDeleteEntity {
  @Column({ nullable: true, type: 'int' })
  public total_column: number;

  @Column({ nullable: true, type: 'int' })
  public total_row: number;

  @Column({ nullable: true, type: 'jsonb' })
  public logs: Record<string, any>;

  @Column({ nullable: true, type: 'int' })
  public data_self_serve_request_id: number;

  @ManyToOne(() => DataSelfServeRequest, (r) => r.validation_logs)
  @JoinColumn({ name: 'data_self_serve_request_id' })
  public request: DataSelfServeRequest;
}
