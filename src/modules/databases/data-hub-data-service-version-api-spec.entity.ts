import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import {
  DataHubApiAuthType,
  DataHubApiBaseUrl,
  DataHubApiMethod,
  DataHubApiSyncMode,
  DataHubApiUpdateFrequency,
} from './data-hub-enums';
import { DataHubDataServiceVersion } from './data-hub-data-service-version.entity';

// API-only fields of a data service version (1-1 with data_hub_data_service_versions)
@Entity('data_hub_data_service_version_api_specs')
export class DataHubDataServiceVersionApiSpec extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public data_service_version_id: number;

  @Column({ type: 'varchar', length: 50 })
  public method: DataHubApiMethod;

  @Column({ type: 'varchar', length: 50 })
  public base_url: DataHubApiBaseUrl;

  @Column({ type: 'varchar', length: 1000 })
  public endpoint_path: string;

  @Column({ type: 'varchar', length: 50 })
  public auth_type: DataHubApiAuthType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  public peak_tps: string | null;

  @Column({ type: 'varchar', length: 50 })
  public update_frequency: DataHubApiUpdateFrequency;

  @Column({ type: 'varchar', length: 50 })
  public sync_mode: DataHubApiSyncMode;

  @Column({ type: 'varchar', length: 100, nullable: true })
  public timeout: string | null;

  @Column({ type: 'jsonb', nullable: true })
  public sample_request: unknown;

  @Column({ type: 'jsonb', nullable: true })
  public sample_response: unknown;

  @OneToOne(() => DataHubDataServiceVersion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'data_service_version_id' })
  public data_service_version?: DataHubDataServiceVersion;
}
