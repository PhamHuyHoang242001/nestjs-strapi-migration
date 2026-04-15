import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MaToolCstbRptProperty } from './ma-tool-cstb-rpt-property.entity';

// History record of report processing runs for a CSTB report property
@Entity('ma_tool_rpt_histories')
export class MaToolRptHistory extends BaseSoftDeleteEntity {
  @Column({ nullable: true, type: 'jsonb' })
  public change_log: object;

  // FK to ma_tool_cstb_rpt_properties (nullable — may be standalone log)
  @Column({ nullable: true, type: 'int' })
  public report_id: number;

  @ManyToOne(() => MaToolCstbRptProperty, (r) => r.rpt_histories)
  @JoinColumn({ name: 'report_id' })
  public report: MaToolCstbRptProperty;
}
