import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BiHubBiccDepartment } from './bi-hub-bicc-department.entity';

// Category classification for BI Diagnostic reports
@Entity('bi_diagnostic_categories')
export class BiDiagnosticCategory extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;

  @Column({ nullable: true })
  public code: string;

  @Column({ type: 'int', nullable: true })
  public bicc_department_id: number;

  @ManyToOne(() => BiHubBiccDepartment)
  @JoinColumn({ name: 'bicc_department_id' })
  public bicc_department: BiHubBiccDepartment;
}
