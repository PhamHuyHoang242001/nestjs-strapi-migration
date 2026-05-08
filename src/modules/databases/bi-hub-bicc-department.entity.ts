import { Entity, Column, OneToMany, ManyToMany, JoinTable } from 'typeorm';
import { BaseAuthorUserSoftDeleteColumn } from '@configuration/base-entity/base-author-user-soft-delete-column.entity';
import { BiHubDescriptiveReport } from './bi-hub-descriptive-report.entity';
import { MaToolS3 } from './ma-tool-s3.entity';
import { BIHubDiagnosticReport } from './bi-diagnostic-report.entity';
export const BICC_DEPARTMENT_S3 = 'bicc_departments_s3s';

export enum BiccDepartmentStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('bi_hub_bicc_departments')
export class BiHubBiccDepartment extends BaseAuthorUserSoftDeleteColumn {
  @OneToMany(() => BiHubDescriptiveReport, (c) => c.bicc_department)
  bi_hub_reports: BiHubDescriptiveReport[];

  @OneToMany(() => BIHubDiagnosticReport, (c) => c.bicc_department)
  bi_hub_diagnostic_reports: BIHubDiagnosticReport[];

  @Column({ type: 'varchar', nullable: false })
  name: string;

  @Column({ type: 'varchar', nullable: false })
  image: string;

  @Column({ type: 'varchar', nullable: false })
  code: string;

  @Column({ type: 'enum', enum: BiccDepartmentStatusEnum, nullable: true })
  status: BiccDepartmentStatusEnum;

  @ManyToMany(() => MaToolS3)
  @JoinTable({
    name: BICC_DEPARTMENT_S3,
    joinColumn: {
      name: 'bicc_department_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 's3_id',
      referencedColumnName: 'id',
    },
  })
  s3s: MaToolS3[];
}
