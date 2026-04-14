import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { MaToolDataServiceCenters } from './ma_tool_data_service_centers.entity';
import { Admins } from './admins.entity';

export enum MaToolCstbRptPropertiesFrqCodeEnum {
  M = 'M',
  Q = 'Q',
  Y2 = 'Y2',
  Y = 'Y',
  D = 'D',
  M3 = 'M3',
}

@Entity('ma_tool_cstb_rpt_properties')
export class MaToolCstbRptProperties {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  rpt_owner?: string;
  @Column({ type: 'varchar', nullable: true })
  rpt_code?: string;
  @Column({ type: 'varchar', nullable: true })
  manual_ind?: string;
  @Column({ type: 'varchar', nullable: true })
  excel_data_region?: string;
  @Column({ type: 'boolean', nullable: true })
  rpt_status?: boolean;
  @Column({ type: 'varchar', nullable: true })
  template_file_name?: string;
  @Column({ type: 'varchar', nullable: true })
  description?: string;
  @Column({ type: 'varchar', nullable: true })
  branch_rpt_ind?: string;
  @Column({ type: 'enum', enum: MaToolCstbRptPropertiesFrqCodeEnum, nullable: true })
  frq_code?: MaToolCstbRptPropertiesFrqCodeEnum;
  @Column({ type: 'varchar', nullable: true })
  report_type?: string;
  @Column({ type: 'int', nullable: true })
  sheets_number?: number;
  @Column({ type: 'varchar', nullable: true })
  check_smy_ind?: string;
  @Column({ type: 'boolean', nullable: true })
  is_root?: boolean;
  @Column({ nullable: true })
  data_service_center_id?: number;
  @ManyToOne(() => MaToolDataServiceCenters)
  @JoinColumn({ name: 'data_service_center_id' })
  data_service_center?: MaToolDataServiceCenters;
  // OneToMany inverse: ma_tool_rpt_histories -> MaToolRptHistories
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