import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

// Hệ thống: parent of Dịch vụ hệ thống and of App thụ hưởng (data_hub_consumers.system_id).
@Entity('data_hub_systems')
export class DataHubSystem extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar', length: 255 })
  public name: string;

  @Column({ type: 'int', nullable: true })
  public created_by: number | null;

  @Column({ type: 'int', nullable: true })
  public updated_by: number | null;

  @Column({ type: 'int', nullable: true })
  public deleted_by: number | null;
}
