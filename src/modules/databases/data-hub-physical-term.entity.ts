import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { DataHubLogicalTerm } from './data-hub-logical-term.entity';

// Physical term of one data service, grouped by a source table; code is unique inside its source table.
// May be unmapped (logical_term_id null). Deletion is a soft delete; old service versions keep their links.
@Entity('data_hub_physical_terms')
export class DataHubPhysicalTerm extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar', length: 255 })
  public code: string;

  @Column({ type: 'text' })
  public technical_description: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  public example_value: string | null;

  @Column({ type: 'int', nullable: true })
  public logical_term_id: number | null;

  @Column({ type: 'int' })
  public source_table_id: number;

  @Column({ type: 'int' })
  public data_service_id: number;

  @Column({ type: 'int' })
  public created_by: number;

  @Column({ type: 'int', nullable: true })
  public updated_by: number | null;

  @ManyToOne(() => DataHubLogicalTerm, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'logical_term_id' })
  public logical_term?: DataHubLogicalTerm | null;
}
