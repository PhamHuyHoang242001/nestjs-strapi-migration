import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { MaToolTemplate } from './ma-tool-template.entity';
import { MaToolSheetColumn } from './ma-tool-sheet-column.entity';

// Sheet template defining one sheet tab within an MA Tool template
@Entity('ma_tool_sheet_templates')
export class MaToolSheetTemplate extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public sheet_code: string;

  @Column({ nullable: true })
  public sheet_name: string;

  @Column({ nullable: true, type: 'text' })
  public description: string;

  @Column({ nullable: true, type: 'int' })
  public order: number;

  // FK to ma_tool_templates
  @Column({ nullable: false, type: 'int' })
  public template_id: number;

  @ManyToOne(() => MaToolTemplate, (t) => t.sheet_templates)
  @JoinColumn({ name: 'template_id' })
  public template: MaToolTemplate;

  // Reverse: columns belonging to this sheet template
  @OneToMany(() => MaToolSheetColumn, (c) => c.sheet_template)
  public sheet_columns: MaToolSheetColumn[];
}
