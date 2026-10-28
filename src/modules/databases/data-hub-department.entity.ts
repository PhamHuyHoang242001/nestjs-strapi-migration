import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

// Phòng ban — independent of divisions
@Entity('data_hub_departments')
export class DataHubDepartment extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar', length: 100 })
  public code: string;

  @Column({ type: 'varchar', length: 255 })
  public name: string;

  @Column({ type: 'int', nullable: true })
  public created_by: number | null;

  @Column({ type: 'int', nullable: true })
  public updated_by: number | null;
}
