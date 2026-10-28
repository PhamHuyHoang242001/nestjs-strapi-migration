import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

// Đơn vị yêu cầu (BU) of a data service
@Entity('data_hub_request_units')
export class DataHubRequestUnit extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar', length: 100 })
  public code: string;

  @Column({ type: 'varchar', length: 255 })
  public name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  public category: string | null;
}
