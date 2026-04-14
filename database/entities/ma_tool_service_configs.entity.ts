import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { MaToolS3s } from './ma_tool_s3s.entity';
import { Admins } from './admins.entity';

export enum MaToolServiceConfigsInputTypeEnum {
  S3 = 'S3',
  SFTP = 'SFTP',
}

export enum MaToolServiceConfigsOutputTypeEnum {
  S3 = 'S3',
  SFTP = 'SFTP',
}

@Entity('ma_tool_service_configs')
export class MaToolServiceConfigs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: false })
  service_name?: string;
  @Column({ type: 'varchar', nullable: false })
  service_code?: string;
  @Column({ type: 'text', nullable: true })
  service_description?: string;
  @Column({ type: 'varchar', nullable: true })
  service_token?: string;
  @Column({ type: 'enum', enum: MaToolServiceConfigsInputTypeEnum, nullable: true })
  input_type?: MaToolServiceConfigsInputTypeEnum;
  @Column({ nullable: true })
  input_s3_id?: number;
  @ManyToOne(() => MaToolS3s)
  @JoinColumn({ name: 'input_s3_id' })
  input_s3?: MaToolS3s;
  @Column({ type: 'enum', enum: MaToolServiceConfigsOutputTypeEnum, nullable: true })
  output_type?: MaToolServiceConfigsOutputTypeEnum;
  @Column({ nullable: true })
  output_s3_id?: number;
  @ManyToOne(() => MaToolS3s)
  @JoinColumn({ name: 'output_s3_id' })
  output_s3?: MaToolS3s;
  // OneToMany inverse: report_convert_logs -> MaToolSbvRptCvtLogs
  // OneToMany inverse: report_convert_log_systems -> MaToolSbvRptCvtLogSystems
  // OneToMany inverse: sbv_rpt_cvt_outputs -> MaToolSbvRptCvtOutputs
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