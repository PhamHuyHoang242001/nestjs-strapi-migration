import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

// Đơn vị chủ quản: one unit owns many App thụ hưởng (data_hub_consumers.owner_unit_id). Name is unique among live
// rows, ignoring case (uq_data_hub_owner_units_name_live).
@Entity('data_hub_owner_units')
export class DataHubOwnerUnit extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar', length: 255 })
  public name: string;

  @Column({ type: 'int', nullable: true })
  public created_by: number | null;

  @Column({ type: 'int', nullable: true })
  public updated_by: number | null;

  @Column({ type: 'int', nullable: true })
  public deleted_by: number | null;
}
