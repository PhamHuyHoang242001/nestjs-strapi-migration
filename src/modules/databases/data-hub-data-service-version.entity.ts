import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { DataHubVersionState } from './data-hub-enums';
import { DataHubDataService } from './data-hub-data-service.entity';

// Immutable content snapshot of a data service; reviewable (pending → approved/rejected)
@Entity('data_hub_data_service_versions')
export class DataHubDataServiceVersion extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public data_service_id: number;

  @Column({ type: 'int' })
  public version_no: number;

  @Column({ type: 'int', nullable: true })
  public old_version: number | null;

  @Column({ type: 'varchar', length: 50, default: DataHubVersionState.PENDING })
  public state: DataHubVersionState;

  @Column({ type: 'varchar', length: 255 })
  public name: string;

  @Column({ type: 'varchar', length: 1000 })
  public short_description: string;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  public purpose: string | null;

  @Column({ type: 'int' })
  public request_unit_id: number;

  @Column({ type: 'int' })
  public division_id: number;

  @Column({ type: 'int' })
  public department_id: number;

  @Column({ type: 'text', default: '' })
  public usage_guide_html: string;

  @Column({ type: 'text', nullable: true })
  public changelog_note: string | null;

  @Column({ type: 'int' })
  public submitted_by: number;

  @Column({ type: 'int', nullable: true })
  public reviewed_by: number | null;

  @Column({ type: 'timestamp without time zone', nullable: true })
  public reviewed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  public reject_reason: string | null;

  @ManyToOne(() => DataHubDataService, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'data_service_id' })
  public data_service?: DataHubDataService;
}
