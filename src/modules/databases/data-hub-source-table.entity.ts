import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

// Bảng nguồn dịch vụ: groups the physical terms of data services. Name unique system-wide among live rows.
// department_id is the department of the service that created it; the tables a department may use also
// include those its services already hold terms in.
@Entity('data_hub_source_tables')
export class DataHubSourceTable extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar', length: 255 })
  public name: string;

  @Column({ type: 'text', nullable: true })
  public description: string | null;

  // Reserved, not used yet.
  @Column({ type: 'varchar', length: 1000, nullable: true })
  public link: string | null;

  @Column({ type: 'int' })
  public department_id: number;

  @Column({ type: 'int' })
  public created_by: number;

  @Column({ type: 'int', nullable: true })
  public updated_by: number | null;
}
