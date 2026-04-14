import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { MaToolSheetColumns } from './ma_tool_sheet_columns.entity';
import { MaToolValidationConfigs } from './ma_tool_validation_configs.entity';
import { Admins } from './admins.entity';

@Entity('ma_tool_validation_rules')
export class MaToolValidationRules {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'simple-json', nullable: true })
  rule_value?: string;
  @Column({ nullable: true })
  sheet_column_id?: number;
  @ManyToOne(() => MaToolSheetColumns)
  @JoinColumn({ name: 'sheet_column_id' })
  sheet_column?: MaToolSheetColumns;
  @Column({ nullable: true })
  validation_rule_config_id?: number;
  @ManyToOne(() => MaToolValidationConfigs)
  @JoinColumn({ name: 'validation_rule_config_id' })
  validation_rule_config?: MaToolValidationConfigs;
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