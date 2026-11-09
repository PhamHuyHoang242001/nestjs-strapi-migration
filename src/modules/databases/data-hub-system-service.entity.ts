import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { DataHubSystem } from './data-hub-system.entity';

// Dịch vụ hệ thống: belongs to one Hệ thống; an App thụ hưởng may point to one (data_hub_consumers.system_service_id).
@Entity('data_hub_system_services')
export class DataHubSystemService extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public system_id: number;

  @ManyToOne(() => DataHubSystem)
  @JoinColumn({ name: 'system_id' })
  public system?: DataHubSystem;

  @Column({ type: 'varchar', length: 255 })
  public name: string;

  @Column({ type: 'int', nullable: true })
  public created_by: number | null;

  @Column({ type: 'int', nullable: true })
  public updated_by: number | null;

  @Column({ type: 'int', nullable: true })
  public deleted_by: number | null;
}
