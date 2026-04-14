import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Admins } from './admins.entity';

export enum MaToolDataServiceCentersModuleStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum MaToolDataServiceCentersDataTypeEnum {
  DATA_SHARING = 'DATA_SHARING',
  DATA_DELIVERY = 'DATA_DELIVERY',
  SELF_SERVE_QUERY_ENGINE = 'SELF_SERVE_QUERY_ENGINE',
  DATA_UPLOAD = 'DATA_UPLOAD',
  DATA_WORKFLOW = 'DATA_WORKFLOW',
}

@Entity('ma_tool_data_service_centers')
export class MaToolDataServiceCenters {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  module_name?: string;
  @Column({ type: 'varchar', nullable: true })
  module_code?: string;
  @Column({ type: 'text', nullable: true })
  description?: string;
  @Column({ type: 'varchar', nullable: true })
  call_to_action_text?: string;
  @Column({ type: 'text', nullable: true })
  image_url?: string;
  @Column({ type: 'enum', enum: MaToolDataServiceCentersModuleStatusEnum, nullable: true })
  module_status?: MaToolDataServiceCentersModuleStatusEnum;
  @Column({ type: 'text', nullable: true })
  link_portal?: string;
  @Column({ type: 'text', nullable: true })
  link_cms?: string;
  @Column({ type: 'boolean', nullable: true })
  is_deleted?: boolean;
  // OneToMany inverse: ma_tool_data_service_center_bookmarks -> DataServiceCenterBookmarks
  // OneToMany inverse: ma_tool_cstb_rpt_properties -> MaToolCstbRptProperties
  // OneToMany inverse: ma_tool_branches -> MaToolBranchConfigs
  // OneToMany inverse: ma_tool_data_service_center_user_uses -> MaToolDataServiceCenterUserUses
  @Column({ type: 'enum', enum: MaToolDataServiceCentersDataTypeEnum, nullable: true })
  data_type?: MaToolDataServiceCentersDataTypeEnum;
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