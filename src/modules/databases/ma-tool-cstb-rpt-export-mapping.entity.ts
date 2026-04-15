import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Field-level export mapping for CSTB reports in MA Tool
@Entity('ma_tool_cstb_rpt_export_mappings')
export class MaToolCstbRptExportMapping extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public source_field: string;

  @Column({ nullable: true })
  public target_field: string;

  @Column({ nullable: true, type: 'jsonb' })
  public transformation_rule: object;
}
