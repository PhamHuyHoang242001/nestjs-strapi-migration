import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MaToolServiceConfig } from './ma-tool-service-config.entity';

// Output record produced by an SBV report conversion run
@Entity('ma_tool_sbv_rpt_cvt_outputs')
export class MaToolSbvRptCvtOutput extends BaseSoftDeleteEntity {
  @Column({ nullable: false, type: 'date' })
  public report_date: Date;

  @Column({ nullable: false })
  public frq_code: string;

  @Column({ nullable: true })
  public rpt_code: string;

  @Column({ nullable: true })
  public rpt_code_sbv: string;

  @Column({ nullable: true })
  public branch_code: string;

  @Column({ nullable: true })
  public branch_sbv_code: string;

  @Column({ nullable: true })
  public branch_rpt_type: boolean;

  @Column({ nullable: true })
  public output_file_path: string;

  @Column({ nullable: true })
  public input_file_path_xlsx: string;

  @Column({ nullable: true })
  public input_file_path_xml: string;

  @Column({ nullable: true })
  public template_file_path: string;

  @Column({ nullable: true })
  public cvt_status: boolean;

  @Column({ nullable: true })
  public file_name: string;

  @Column({ nullable: true, default: false })
  public is_old_version: boolean;

  @Column({ nullable: true, default: false })
  public is_migrate: boolean;

  // FK to ma_tool_service_configs (nullable)
  @Column({ nullable: true, type: 'int' })
  public service_config_id: number;

  @ManyToOne(() => MaToolServiceConfig)
  @JoinColumn({ name: 'service_config_id' })
  public service_config: MaToolServiceConfig;
}
