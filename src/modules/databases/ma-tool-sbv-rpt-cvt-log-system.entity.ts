import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { MaToolLogLevel } from '@common/enums/ma-tool.enums';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MaToolServiceConfig } from './ma-tool-service-config.entity';

// System-level log for SBV report conversion pipeline steps
@Entity('ma_tool_sbv_rpt_cvt_log_systems')
export class MaToolSbvRptCvtLogSystem extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public filename_input: string;

  @Column({ nullable: true, type: 'enum', enum: MaToolLogLevel })
  public log_type: MaToolLogLevel;

  @Column({ nullable: true, type: 'text' })
  public message: string;

  @Column({ nullable: true })
  public rpt_code: string;

  // FK to ma_tool_service_configs (nullable)
  @Column({ nullable: true, type: 'int' })
  public service_config_id: number;

  @ManyToOne(() => MaToolServiceConfig)
  @JoinColumn({ name: 'service_config_id' })
  public service_config: MaToolServiceConfig;
}
