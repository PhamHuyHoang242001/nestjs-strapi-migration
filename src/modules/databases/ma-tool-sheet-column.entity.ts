import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MaToolSheetTemplate } from './ma-tool-sheet-template.entity';

// Column definition for an MA Tool sheet template
@Entity('ma_tool_sheet_columns')
export class MaToolSheetColumn extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public column_code: string;

  @Column({ nullable: true })
  public column_name: string;

  @Column({ nullable: true })
  public column_type: string;

  @Column({ nullable: true, type: 'int' })
  public column_order: number;

  @Column({ nullable: true })
  public is_required: boolean;

  @Column({ nullable: true })
  public validation_rule: string;

  // FK to ma_tool_sheet_templates
  @Column({ nullable: false, type: 'int' })
  public ma_tool_sheet_template_id: number;

  @ManyToOne(() => MaToolSheetTemplate, (s) => s.sheet_columns)
  @JoinColumn({ name: 'ma_tool_sheet_template_id' })
  public sheet_template: MaToolSheetTemplate;
}
