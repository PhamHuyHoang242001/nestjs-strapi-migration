import { Column, Entity } from 'typeorm';
import { BaseColumn } from '@configuration/base-entity';

// SO dịch vụ of a data service version
@Entity('data_hub_data_service_version_service_owners')
export class DataHubDataServiceVersionServiceOwner extends BaseColumn {
  @Column({ type: 'int' })
  public data_service_version_id: number;

  @Column({ type: 'int' })
  public user_id: number;
}
