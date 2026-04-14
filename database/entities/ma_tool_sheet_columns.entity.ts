import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { MaToolSheetTemplates } from './ma_tool_sheet_templates.entity';
import { Admins } from './admins.entity';

export enum MaToolSheetColumnsTypeEnum {
  NUMBER = 'number',
  TEXT = 'text',
}

@Entity('ma_tool_sheet_columns')
export class MaToolSheetColumns {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  name?: string;
  @Column({ type: 'enum', enum: MaToolSheetColumnsTypeEnum, nullable: true })
  type?: MaToolSheetColumnsTypeEnum;
  @Column({ type: 'int', nullable: true })
  order?: number;
  @Column({ type: 'boolean', nullable: true })
  is_require?: boolean;
  @Column({ type: 'boolean', nullable: true })
  is_unique?: boolean;
  @Column({ type: 'boolean', nullable: true })
  is_composite_unique?: boolean;
  @Column({ nullable: true })
  sheet_template_id?: number;
  @ManyToOne(() => MaToolSheetTemplates)
  @JoinColumn({ name: 'sheet_template_id' })
  sheet_template?: MaToolSheetTemplates;
  // OneToMany inverse: validation_rules -> MaToolValidationRules
  @Column({ nullable: true })
  created_by?: number;
  @ManyToOne(() => Admins)
  @JoinColumn({ name: 'created_by' })
  created_by_admin?: Admins;
  @Column({ nullable: true })
  updated_by?: number;
  @ManyToOne(() => Admins)
  @JoinColumn({ name: 'updated_by' })
  updated_by_admin?: Admins;
}