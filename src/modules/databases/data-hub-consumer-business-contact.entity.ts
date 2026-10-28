import { Column, Entity } from 'typeorm';
import { BaseColumn } from '@configuration/base-entity';

// Đầu mối liên hệ nghiệp vụ (business contact) of a consumer, many per consumer
@Entity('data_hub_consumer_business_contacts')
export class DataHubConsumerBusinessContact extends BaseColumn {
  @Column({ type: 'int' })
  public consumer_id: number;

  @Column({ type: 'int' })
  public user_id: number;
}
