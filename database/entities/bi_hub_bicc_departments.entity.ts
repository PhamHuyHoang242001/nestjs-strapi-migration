import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BiHubBiccDepartmentsMaToolS3s } from './bi_hub_bicc_departments_ma_tool_s3s.entity';
import { Admins } from './admins.entity';

export enum BiHubBiccDepartmentsBiccDepartmentStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('bi_hub_bicc_departments')
export class BiHubBiccDepartments {
  @PrimaryGeneratedColumn()
  id: number;
  // OneToMany inverse: bi_hub_reports -> BiHubReports
  @Column({ type: 'varchar', nullable: false })
  name?: string;
  @Column({ type: 'varchar', nullable: false })
  image?: string;
  @Column({ type: 'varchar', nullable: false })
  code?: string;
  @Column({ type: 'enum', enum: BiHubBiccDepartmentsBiccDepartmentStatusEnum, nullable: true })
  bicc_department_status?: BiHubBiccDepartmentsBiccDepartmentStatusEnum;
  // OneToMany inverse: bi_diagnostic_categories -> BiDiagnosticCategories
  // OneToMany inverse: diagnostic_scopes -> BiDiagnosticScope
  @OneToMany(() => BiHubBiccDepartmentsMaToolS3s, (p) => p.bi_hub_bicc_departments)
  s3_buckets_links?: BiHubBiccDepartmentsMaToolS3s[];
  // OneToMany inverse: bi_payment_projects -> BiPaymentProjects
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