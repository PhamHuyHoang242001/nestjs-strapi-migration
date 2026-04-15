import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Lookup table for data self-serve segment codes
@Entity('data_self_serve_segments')
export class DataSelfServeSegment extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public seg_code: string;

  @Column({ nullable: true, type: 'date' })
  public business_date: string;
}
