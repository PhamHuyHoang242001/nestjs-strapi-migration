import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

export enum MaToolReportAdtlConfigsStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('ma_tool_report_adtl_configs')
export class MaToolReportAdtlConfigs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  rpt_code?: string;
  @Column({ type: 'varchar', nullable: true })
  department?: string;
  @Column({ type: 'varchar', nullable: true })
  approver_phone?: string;
  @Column({ type: 'varchar', nullable: true })
  approver_id?: string;
  @Column({ type: 'enum', enum: MaToolReportAdtlConfigsStatusEnum, nullable: true })
  status?: MaToolReportAdtlConfigsStatusEnum;
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