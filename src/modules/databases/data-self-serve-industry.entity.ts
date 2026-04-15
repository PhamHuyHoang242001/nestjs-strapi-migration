import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Lookup table for data self-serve industry codes
@Entity('data_self_serve_industries')
export class DataSelfServeIndustry extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public industry_code: string;

  @Column({ nullable: true, type: 'date' })
  public business_date: string;
}
