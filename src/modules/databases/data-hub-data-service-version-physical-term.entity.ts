import { Column, Entity } from 'typeorm';
import { BaseColumn } from '@configuration/base-entity';

// Data service version ↔ physical column (N-N)
@Entity('data_hub_data_service_version_physical_terms')
export class DataHubDataServiceVersionPhysicalTerm extends BaseColumn {
  @Column({ type: 'int' })
  public data_service_version_id: number;

  @Column({ type: 'int' })
  public physical_term_id: number;
}
