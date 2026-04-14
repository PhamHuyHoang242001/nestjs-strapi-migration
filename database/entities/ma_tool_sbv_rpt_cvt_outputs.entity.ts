import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { MaToolServiceConfigs } from './ma_tool_service_configs.entity';
import { Admins } from './admins.entity';

export enum MaToolSbvRptCvtOutputsFrqCodeEnum {
  M = 'M',
  Q = 'Q',
  Y2 = 'Y2',
  Y = 'Y',
  D = 'D',
  M3 = 'M3',
}

@Entity('ma_tool_sbv_rpt_cvt_outputs')
export class MaToolSbvRptCvtOutputs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'timestamp', nullable: false })
  report_date?: string;
  @Column({ type: 'enum', enum: MaToolSbvRptCvtOutputsFrqCodeEnum, nullable: false })
  frq_code?: MaToolSbvRptCvtOutputsFrqCodeEnum;
  @Column({ type: 'varchar', nullable: true })
  rpt_code?: string;
  @Column({ type: 'varchar', nullable: true })
  rpt_code_sbv?: string;
  @Column({ type: 'varchar', nullable: true })
  branch_code?: string;
  @Column({ type: 'varchar', nullable: true })
  branch_sbv_code?: string;
  @Column({ type: 'boolean', nullable: true })
  branch_rpt_type?: boolean;
  @Column({ type: 'varchar', nullable: true })
  output_file_path?: string;
  @Column({ type: 'varchar', nullable: true })
  input_file_path_xlsx?: string;
  @Column({ type: 'varchar', nullable: true })
  input_file_path_xml?: string;
  @Column({ type: 'varchar', nullable: true })
  template_file_path?: string;
  @Column({ type: 'boolean', nullable: true })
  cvt_status?: boolean;
  @Column({ type: 'varchar', nullable: true })
  file_name?: string;
  @Column({ type: 'boolean', nullable: true })
  is_old_version?: boolean;
  @Column({ nullable: true })
  service_config_id?: number;
  @ManyToOne(() => MaToolServiceConfigs)
  @JoinColumn({ name: 'service_config_id' })
  service_config?: MaToolServiceConfigs;
  @Column({ type: 'boolean', nullable: true })
  is_migrate?: boolean;
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