import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Category classification for BI Diagnostic reports
@Entity('bi_diagnostic_categories')
export class BiDiagnosticCategory extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;

  @Column({ nullable: true })
  public code: string;
}
