import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { MaToolS3s } from './ma_tool_s3s.entity';
import { BiHubBiccDepartments } from './bi_hub_bicc_departments.entity';
import { AdminsBiPaymentProjects } from './admins_bi_payment_projects.entity';
import { BiPaymentProjectsFeedbackUsers } from './bi_payment_projects_feedback_users.entity';
import { BiPaymentCategoriesBiPaymentProjects } from './bi_payment_categories_bi_payment_projects.entity';
import { Admins } from './admins.entity';

export enum BiPaymentProjectsProjectTypeEnum {
  REGULAR = 'regular',
  ADHOC = 'adhoc',
}

export enum BiPaymentProjectsProjectStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('bi_payment_projects')
export class BiPaymentProjects {
  @PrimaryGeneratedColumn()
  id: number;
  @Column({ type: 'varchar', nullable: true })
  project_code?: string;
  @Column({ nullable: true })
  s3_bucket_id?: number;
  @ManyToOne(() => MaToolS3s)
  @JoinColumn({ name: 's3_bucket_id' })
  s3_bucket?: MaToolS3s;
  @Column({ type: 'varchar', nullable: true })
  project_name?: string;
  @Column({ type: 'varchar', nullable: true })
  description?: string;
  @Column({ nullable: true })
  bicc_department_id?: number;
  @ManyToOne(() => BiHubBiccDepartments)
  @JoinColumn({ name: 'bicc_department_id' })
  bicc_department?: BiHubBiccDepartments;
  @Column({ type: 'enum', enum: BiPaymentProjectsProjectTypeEnum, nullable: true })
  project_type?: BiPaymentProjectsProjectTypeEnum;
  @Column({ type: 'timestamp', nullable: true })
  expected_starting_date?: string;
  @Column({ type: 'timestamp', nullable: true })
  expected_ending_date?: string;
  @Column({ type: 'enum', enum: BiPaymentProjectsProjectStatusEnum, nullable: true })
  project_status?: BiPaymentProjectsProjectStatusEnum;
  @Column({ type: 'text', nullable: true })
  bicc_pic?: string;
  @Column({ type: 'text', nullable: true })
  bu_pic?: string;
  @OneToMany(() => AdminsBiPaymentProjects, (p) => p.bi_payment_projects)
  bicc_admins_links?: AdminsBiPaymentProjects[];
  @OneToMany(() => BiPaymentProjectsFeedbackUsers, (p) => p.bi_payment_projects)
  bicc_users_links?: BiPaymentProjectsFeedbackUsers[];
  @OneToMany(() => BiPaymentProjectsFeedbackUsers, (p) => p.bi_payment_projects)
  bu_users_links?: BiPaymentProjectsFeedbackUsers[];
  @Column({ type: 'text', nullable: true })
  requester?: string;
  @Column({ type: 'simple-json', nullable: true })
  files?: string;
  // OneToMany inverse: programs -> BiPaymentPrograms
  // OneToMany inverse: work_steps -> BiPaymentWorkSteps
  @Column({ type: 'text', nullable: true })
  requester_unit?: string;
  @OneToMany(() => BiPaymentCategoriesBiPaymentProjects, (p) => p.bi_payment_projects)
  categories_links?: BiPaymentCategoriesBiPaymentProjects[];
  @Column({ type: 'boolean', nullable: true })
  is_deleted?: boolean;
  // OneToMany inverse: bi_payment_project_histories -> BiPaymentProjectHistories
  @Column({ type: 'simple-json', nullable: true })
  frequencies?: string;
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