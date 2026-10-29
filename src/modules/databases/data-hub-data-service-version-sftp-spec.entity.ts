import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import {
  DataHubSftpEncryption,
  DataHubSftpExportFrequency,
  DataHubSftpFileFormat,
  DataHubSftpFlowDirection,
} from './data-hub-enums';
import { DataHubDataServiceVersion } from './data-hub-data-service-version.entity';

// SFTP-only fields of a data service version (1-1 with data_hub_data_service_versions)
@Entity('data_hub_data_service_version_sftp_specs')
export class DataHubDataServiceVersionSftpSpec extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public data_service_version_id: number;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  public folder_path: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  public file_name_pattern: string | null;

  @Column({ type: 'varchar', length: 50 })
  public file_format: DataHubSftpFileFormat;

  @Column({ type: 'varchar', length: 50 })
  public export_frequency: DataHubSftpExportFrequency;

  @Column({ type: 'varchar', length: 255, nullable: true })
  public max_file_size: string | null;

  @Column({ type: 'varchar', length: 50 })
  public encryption: DataHubSftpEncryption;

  @Column({ type: 'varchar', length: 50, nullable: true })
  public flow_direction: DataHubSftpFlowDirection | null;

  @OneToOne(() => DataHubDataServiceVersion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'data_service_version_id' })
  public data_service_version?: DataHubDataServiceVersion;
}
