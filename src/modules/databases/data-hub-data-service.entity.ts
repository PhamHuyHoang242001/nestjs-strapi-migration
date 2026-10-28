import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { DataHubServiceType, DataHubStatus } from './data-hub-enums';

// Data service package: identity fixed across versions + pointer to the live version (content lives in versions)
@Entity('data_hub_data_services')
export class DataHubDataService extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar', length: 100 })
  public service_code: string;

  @Column({ type: 'varchar', length: 50 })
  public service_type: DataHubServiceType;

  @Column({ type: 'varchar', length: 50, default: DataHubStatus.ACTIVE })
  public status: DataHubStatus;

  @Column({ type: 'int', nullable: true })
  public active_version_id: number | null;

  @Column({ type: 'int' })
  public created_by: number;

  @Column({ type: 'int', nullable: true })
  public updated_by: number | null;
}
