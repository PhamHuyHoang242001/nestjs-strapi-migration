import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { DataHubApiAuthType, DataHubApiMethod, DataHubApiSyncMode, DataHubApiUpdateFrequency } from './data-hub-enums';
import { DataHubDataServiceVersion } from './data-hub-data-service-version.entity';
import { IntegrationDomainConfig } from './integration-domain-config.entity';

// API-only fields of a data service version (1-1 with data_hub_data_service_versions)
@Entity('data_hub_data_service_version_api_specs')
export class DataHubDataServiceVersionApiSpec extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public data_service_version_id: number;

  @Column({ type: 'varchar', length: 50 })
  public method: DataHubApiMethod;

  // Gateway the API is published on (shared integration_domain_configs table, many specs -> one domain).
  @Column({ type: 'int' })
  public domain_id: number;

  @ManyToOne(() => IntegrationDomainConfig)
  @JoinColumn({ name: 'domain_id' })
  public domain: IntegrationDomainConfig;

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
