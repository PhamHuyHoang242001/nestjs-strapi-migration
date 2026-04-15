import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { MaToolSbvRptCvtLogStatus, MaToolLogLevel } from '@common/enums/ma-tool.enums';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MaToolServiceConfig } from './ma-tool-service-config.entity';

// Log entry for an SBV report conversion job in MA Tool
@Entity('ma_tool_sbv_rpt_cvt_logs')
export class MaToolSbvRptCvtLog extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public filename_input: string;

  @Column({ nullable: true, type: 'enum', enum: MaToolSbvRptCvtLogStatus })
  public step: MaToolSbvRptCvtLogStatus;

  @Column({ nullable: true })
  public rpt_code: string;

  @Column({ nullable: true, type: 'enum', enum: MaToolLogLevel })
  public log_type: MaToolLogLevel;

  @Column({ nullable: true, type: 'text' })
  public message: string;

  // FK to ma_tool_service_configs (nullable)
  @Column({ nullable: true, type: 'int' })
  public service_config_id: number;

  @ManyToOne(() => MaToolServiceConfig)
  @JoinColumn({ name: 'service_config_id' })
  public service_config: MaToolServiceConfig;
}
