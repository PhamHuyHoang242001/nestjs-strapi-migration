import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { DataHubServiceHistoryAction } from './data-hub-enums';

// Consumer app snapshot per version (edits and status toggles)
@Entity('data_hub_consumer_histories')
export class DataHubConsumerHistory extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public consumer_id: number;

  @Column({ type: 'int' })
  public version_no: number;

  @Column({ type: 'varchar', length: 50 })
  public action: DataHubServiceHistoryAction;

  @Column({ type: 'jsonb' })
  public snapshot: Record<string, unknown>;

  @Column({ type: 'int' })
  public changed_by: number;
}
