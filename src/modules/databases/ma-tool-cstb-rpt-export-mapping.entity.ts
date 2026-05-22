import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Mapping rules for exporting CSTB regulatory reports to SBV format
@Entity('ma_tool_cstb_rpt_export_mappings')
export class MaToolCstbRptExportMapping extends BaseSoftDeleteEntity {
  @Column({ nullable: true, type: 'int' })
  public stt: number;

  @Column({ nullable: true })
  public rpt_code: string;

  @Column({ nullable: true, type: 'text' })
  public rpt_code_sbv: string;

  @Column({ nullable: true, type: 'int' })
  public rpt_type: number;

  @Column({ nullable: true, type: 'text' })
  public export_template: string;

  @Column({ nullable: true })
  public first_col_trg_type_2: string;

  @Column({ nullable: true, type: 'int' })
  public first_row_trg_type_2: number;

  @Column({ nullable: true })
  public last_col_trg_type_2: string;

  @Column({ nullable: true, type: 'int' })
  public last_row_trg_type_2: number;

  @Column({ nullable: true })
  public first_col_src_type_2: string;

  @Column({ nullable: true, type: 'int' })
  public first_row_src_type_2: number;

  @Column({ nullable: true, type: 'int' })
  public sum_row_trg_type_2: number;

  @Column({ nullable: true, type: 'int' })
  public num_range_type_1: number;

  @Column({ nullable: true })
  public range_01_trg_type_1: string;

  @Column({ nullable: true })
  public range_01_src_type_1: string;

  @Column({ nullable: true })
  public range_02_trg_type_1: string;

  @Column({ nullable: true })
  public range_02_src_type_1: string;

  @Column({ nullable: true })
  public range_03_trg_type_1: string;

  @Column({ nullable: true })
  public range_03_src_type_1: string;

  @Column({ nullable: true })
  public range_04_trg_type_1: string;

  @Column({ nullable: true })
  public range_04_src_type_1: string;

  @Column({ nullable: true })
  public range_05_trg_type_1: string;

  @Column({ nullable: true })
  public range_05_src_type_1: string;

  @Column({ nullable: true })
  public range_06_trg_type_1: string;

  @Column({ nullable: true })
  public range_06_src_type_1: string;

  @Column({ nullable: true })
  public range_07_trg_type_1: string;

  @Column({ nullable: true })
  public range_07_src_type_1: string;

  @Column({ nullable: true })
  public range_08_trg_type_1: string;

  @Column({ nullable: true })
  public range_08_src_type_1: string;

  @Column({ nullable: true })
  public mapping_status: string;

  @Column({ nullable: true })
  public last_col_src_type_2: string;

  @Column({ nullable: true })
  public first_cell_src_type_1: string;
}
