import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { DataHubHistoryAction } from './data-hub-enums';

// Logical term snapshot per version, including the physical columns attached at that time
@Entity('data_hub_logical_term_histories')
export class DataHubLogicalTermHistory extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public logical_term_id: number;

  @Column({ type: 'int' })
  public version_no: number;

  @Column({ type: 'varchar', length: 50 })
  public action: DataHubHistoryAction;

  @Column({ type: 'jsonb' })
  public snapshot: Record<string, unknown>;

  @Column({ type: 'int' })
  public changed_by: number;
}
