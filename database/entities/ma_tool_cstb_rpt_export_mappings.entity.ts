import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

@Entity('ma_tool_cstb_rpt_export_mappings')
export class MaToolCstbRptExportMappings {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'int', nullable: true })
  stt?: number;
  @Column({ type: 'varchar', nullable: true })
  rpt_code?: string;
  @Column({ type: 'text', nullable: true })
  rpt_code_sbv?: string;
  @Column({ type: 'int', nullable: true })
  rpt_type?: number;
  @Column({ type: 'text', nullable: true })
  export_template?: string;
  @Column({ type: 'varchar', nullable: true })
  first_col_trg_type_2?: string;
  @Column({ type: 'int', nullable: true })
  first_row_trg_type_2?: number;
  @Column({ type: 'varchar', nullable: true })
  last_col_trg_type_2?: string;
  @Column({ type: 'int', nullable: true })
  last_row_trg_type_2?: number;
  @Column({ type: 'varchar', nullable: true })
  first_col_src_type_2?: string;
  @Column({ type: 'int', nullable: true })
  first_row_src_type_2?: number;
  @Column({ type: 'int', nullable: true })
  sum_row_trg_type_2?: number;
  @Column({ type: 'int', nullable: true })
  num_range_type_1?: number;
  @Column({ type: 'varchar', nullable: true })
  range_01_trg_type_1?: string;
  @Column({ type: 'varchar', nullable: true })
  range_01_src_type_1?: string;
  @Column({ type: 'varchar', nullable: true })
  range_02_trg_type_1?: string;
  @Column({ type: 'varchar', nullable: true })
  range_02_src_type_1?: string;
  @Column({ type: 'varchar', nullable: true })
  range_03_trg_type_1?: string;
  @Column({ type: 'varchar', nullable: true })
  range_03_src_type_1?: string;
  @Column({ type: 'varchar', nullable: true })
  range_04_trg_type_1?: string;
  @Column({ type: 'varchar', nullable: true })
  range_04_src_type_1?: string;
  @Column({ type: 'varchar', nullable: true })
  range_05_trg_type_1?: string;
  @Column({ type: 'varchar', nullable: true })
  range_05_src_type_1?: string;
  @Column({ type: 'varchar', nullable: true })
  range_06_trg_type_1?: string;
  @Column({ type: 'varchar', nullable: true })
  range_06_src_type_1?: string;
  @Column({ type: 'varchar', nullable: true })
  range_07_trg_type_1?: string;
  @Column({ type: 'varchar', nullable: true })
  range_07_src_type_1?: string;
  @Column({ type: 'varchar', nullable: true })
  range_08_trg_type_1?: string;
  @Column({ type: 'varchar', nullable: true })
  range_08_src_type_1?: string;
  @Column({ type: 'varchar', nullable: true })
  mapping_status?: string;
  @Column({ type: 'varchar', nullable: true })
  last_col_src_type_2?: string;
  @Column({ type: 'varchar', nullable: true })
  first_cell_src_type_1?: string;
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