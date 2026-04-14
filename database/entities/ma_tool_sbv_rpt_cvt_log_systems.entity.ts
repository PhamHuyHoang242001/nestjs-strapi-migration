import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { MaToolServiceConfigs } from './ma_tool_service_configs.entity';
import { Admins } from './admins.entity';

export enum MaToolSbvRptCvtLogSystemsLogTypeEnum {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

@Entity('ma_tool_sbv_rpt_cvt_log_systems')
export class MaToolSbvRptCvtLogSystems {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ nullable: true })
  service_config_id?: number;
  @ManyToOne(() => MaToolServiceConfigs)
  @JoinColumn({ name: 'service_config_id' })
  service_config?: MaToolServiceConfigs;
  @Column({ type: 'varchar', nullable: true })
  filename_input?: string;
  @Column({ type: 'enum', enum: MaToolSbvRptCvtLogSystemsLogTypeEnum, nullable: true })
  log_type?: MaToolSbvRptCvtLogSystemsLogTypeEnum;
  @Column({ type: 'text', nullable: true })
  message?: string;
  @Column({ type: 'varchar', nullable: true })
  rpt_code?: string;
  @Column({ nullable: true })
  service_code_id?: number;
  @ManyToOne(() => MaToolServiceConfigs)
  @JoinColumn({ name: 'service_code_id' })
  service_code?: MaToolServiceConfigs;
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