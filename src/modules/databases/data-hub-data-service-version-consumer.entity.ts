import { Column, Entity } from 'typeorm';
import { BaseColumn } from '@configuration/base-entity';

// Data service version ↔ consumer app (N-N)
@Entity('data_hub_data_service_version_consumers')
export class DataHubDataServiceVersionConsumer extends BaseColumn {
  @Column({ type: 'int' })
  public data_service_version_id: number;

  @Column({ type: 'int' })
  public consumer_id: number;
}
