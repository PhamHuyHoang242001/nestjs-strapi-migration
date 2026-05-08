import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Scope classification for BI Hub Diagnostic reports
@Entity('bi_hub_diagnostic_scopes')
export class BiHubDiagnosticScope extends BaseSoftDeleteEntity {
  @Column({ nullable: false })
  name: string;

  @Column({ nullable: true })
  code: string;
}
