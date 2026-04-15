import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Scope classification for BI Diagnostic reports
@Entity('bi_diagnostic_scopes')
export class BiDiagnosticScope extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  public name: string;

  @Column({ nullable: true })
  public code: string;
}
