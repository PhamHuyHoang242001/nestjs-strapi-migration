import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { MaToolDataServiceCenters } from './ma_tool_data_service_centers.entity';
import { Admins } from './admins.entity';

export enum MaToolBranchConfigsBranchStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('ma_tool_branch_configs')
export class MaToolBranchConfigs {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: false })
  branch_code?: string;
  @Column({ type: 'varchar', nullable: false })
  branch_name?: string;
  @Column({ type: 'varchar', nullable: false })
  branch_sbv_code?: string;
  @Column({ type: 'enum', enum: MaToolBranchConfigsBranchStatusEnum, nullable: true })
  branch_status?: MaToolBranchConfigsBranchStatusEnum;
  // OneToMany inverse: mapping_user_branches -> MaToolMappingUserBranches
  @Column({ nullable: true })
  data_service_center_id?: number;
  @ManyToOne(() => MaToolDataServiceCenters)
  @JoinColumn({ name: 'data_service_center_id' })
  data_service_center?: MaToolDataServiceCenters;
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