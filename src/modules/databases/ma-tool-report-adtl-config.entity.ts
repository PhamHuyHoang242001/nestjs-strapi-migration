import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Additional key/value configuration for MA Tool report generation
@Entity('ma_tool_report_adtl_configs')
export class MaToolReportAdtlConfig extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public config_key: string;

  @Column({ nullable: true, type: 'jsonb' })
  public config_value: object;
}
