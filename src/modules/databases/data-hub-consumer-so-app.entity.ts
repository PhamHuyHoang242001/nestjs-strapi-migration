import { Column, Entity } from 'typeorm';
import { BaseColumn } from '@configuration/base-entity';

// SO APP of a consumer: many users per consumer (plain user ids, no FK)
@Entity('data_hub_consumer_so_apps')
export class DataHubConsumerSoApp extends BaseColumn {
  @Column({ type: 'int' })
  public consumer_id: number;

  @Column({ type: 'int' })
  public user_id: number;
}
