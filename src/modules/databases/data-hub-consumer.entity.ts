import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { DataHubConsumerCategory, DataHubStatus } from './data-hub-enums';

// App thụ hưởng. SO APP users live in data_hub_consumer_so_apps (plain user ids, no FK)
@Entity('data_hub_consumers')
export class DataHubConsumer extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar', length: 100 })
  public code: string;

  @Column({ type: 'varchar', length: 255 })
  public name: string;

  @Column({ type: 'varchar', length: 50 })
  public category: DataHubConsumerCategory;

  @Column({ type: 'int' })
  public division_id: number;

  @Column({ type: 'varchar', length: 1000 })
  public short_description: string;

  // URL of the uploaded avatar image (nullable, URL only — no metadata).
  @Column({ type: 'varchar', length: 2000, nullable: true })
  public avatar_url: string | null;

  @Column({ type: 'varchar', length: 50, default: DataHubStatus.ACTIVE })
  public status: DataHubStatus;

  @Column({ type: 'int', default: 1 })
  public version_no: number;

  @Column({ type: 'int' })
  public created_by: number;

  @Column({ type: 'int', nullable: true })
  public updated_by: number | null;
}
