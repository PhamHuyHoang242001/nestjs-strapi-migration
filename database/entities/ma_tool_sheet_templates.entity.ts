import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { MaToolTemplates } from './ma_tool_templates.entity';
import { Admins } from './admins.entity';

@Entity('ma_tool_sheet_templates')
export class MaToolSheetTemplates {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  name?: string;
  @Column({ type: 'boolean', nullable: true })
  is_deleted?: boolean;
  @Column({ type: 'int', nullable: true })
  order?: number;
  @Column({ nullable: true })
  template_id?: number;
  @ManyToOne(() => MaToolTemplates)
  @JoinColumn({ name: 'template_id' })
  template?: MaToolTemplates;
  // OneToMany inverse: sheet_columns -> MaToolSheetColumns
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