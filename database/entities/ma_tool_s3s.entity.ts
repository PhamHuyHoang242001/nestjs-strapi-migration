import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BiHubBiccDepartmentsMaToolS3s } from './bi_hub_bicc_departments_ma_tool_s3s.entity';
import { Admins } from './admins.entity';

export enum MaToolS3sRegionEnum {
  AP_SOUTHEAST_1 = 'ap-southeast-1',
}

@Entity('ma_tool_s3s')
export class MaToolS3s {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  bucket_name?: string;
  @Column({ type: 'varchar', nullable: true })
  description?: string;
  @Column({ type: 'varchar', nullable: true })
  endpoint?: string;
  @Column({ type: 'varchar', nullable: true })
  prefix?: string;
  // OneToMany inverse: workspaces -> MaToolWorkspaces
  @Column({ type: 'enum', enum: MaToolS3sRegionEnum, nullable: true })
  region?: MaToolS3sRegionEnum;
  @Column({ type: 'varchar', nullable: true })
  role_arn?: string;
  // OneToMany inverse: bi_payment_projects -> BiPaymentProjects
  @OneToMany(() => BiHubBiccDepartmentsMaToolS3s, (p) => p.ma_tool_s3s)
  bicc_departments_links?: BiHubBiccDepartmentsMaToolS3s[];
  // OneToMany inverse: input_service_configs -> MaToolServiceConfigs
  // OneToMany inverse: output_service_configs -> MaToolServiceConfigs
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