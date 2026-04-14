import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

export enum MaToolValidationConfigsInputTypeEnum {
  TEXT = 'text',
  NUMBER = 'number',
  DATE = 'date',
  DATETIME = 'datetime',
  BOOLEAN = 'boolean',
}

@Entity('ma_tool_validation_configs')
export class MaToolValidationConfigs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  name?: string;
  @Column({ type: 'varchar', nullable: true })
  key?: string;
  @Column({ type: 'varchar', nullable: true })
  short_desc?: string;
  @Column({ type: 'varchar', nullable: true })
  default_value?: string;
  @Column({ type: 'varchar', nullable: true })
  description?: string;
  @Column({ type: 'enum', enum: MaToolValidationConfigsInputTypeEnum, nullable: true })
  input_type?: MaToolValidationConfigsInputTypeEnum;
  @Column({ type: 'simple-json', nullable: true })
  column_types?: string;
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