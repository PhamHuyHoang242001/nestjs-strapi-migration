import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BiHubBiccDepartments } from './bi_hub_bicc_departments.entity';
import { Admins } from './admins.entity';

export enum BiDiagnosticCategoriesCategoryStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('bi_diagnostic_categories')
export class BiDiagnosticCategories {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  name?: string;
  @Column({ nullable: true })
  bicc_department_id?: number;
  @ManyToOne(() => BiHubBiccDepartments)
  @JoinColumn({ name: 'bicc_department_id' })
  bicc_department?: BiHubBiccDepartments;
  @Column({ type: 'varchar', nullable: true })
  thumbnail?: string;
  // OneToMany inverse: bi_diagnostic_reports -> BiDiagnosticReports
  @Column({ type: 'enum', enum: BiDiagnosticCategoriesCategoryStatusEnum, nullable: true })
  category_status?: BiDiagnosticCategoriesCategoryStatusEnum;
  @Column({ type: 'boolean', nullable: true })
  is_auto_fill_group_user?: boolean;
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