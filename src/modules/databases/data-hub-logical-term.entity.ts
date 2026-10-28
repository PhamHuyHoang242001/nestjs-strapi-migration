import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

// Logical term: shared business definition for many physical columns
@Entity('data_hub_logical_terms')
export class DataHubLogicalTerm extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar', length: 255 })
  public code: string;

  @Column({ type: 'varchar', length: 1000 })
  public short_description: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  public example_value: string | null;

  @Column({ type: 'int', default: 1 })
  public version_no: number;

  @Column({ type: 'int' })
  public created_by: number;

  @Column({ type: 'int', nullable: true })
  public updated_by: number | null;
}
