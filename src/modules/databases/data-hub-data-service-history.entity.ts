import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { DataHubServiceChange, DataHubServiceHistoryAction } from './data-hub-enums';

// Change log of a data service: changed fields only (old/new); STATUS rows record the active/inactive toggle
@Entity('data_hub_data_service_histories')
export class DataHubDataServiceHistory extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public data_service_id: number;

  @Column({ type: 'int', nullable: true })
  public data_service_version_id: number | null;

  @Column({ type: 'int', nullable: true })
  public version_no: number | null;

  @Column({ type: 'varchar', length: 50 })
  public action: DataHubServiceHistoryAction;

  @Column({ type: 'text', nullable: true })
  public change_note: string | null;

  @Column({ type: 'jsonb', nullable: true })
  public changes: DataHubServiceChange[] | null;

  @Column({ type: 'int' })
  public changed_by: number;
}
