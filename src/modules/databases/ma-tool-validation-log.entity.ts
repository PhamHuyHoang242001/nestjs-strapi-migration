import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MaToolTemplate } from './ma-tool-template.entity';

// Log of a validation run against an MA Tool template's data
@Entity('ma_tool_validation_logs')
export class MaToolValidationLog extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public validation_status: string;

  @Column({ nullable: true, type: 'int' })
  public error_count: number;

  @Column({ nullable: true, type: 'jsonb' })
  public error_details: object;

  // FK to ma_tool_templates
  @Column({ nullable: false, type: 'int' })
  public template_id: number;

  @ManyToOne(() => MaToolTemplate)
  @JoinColumn({ name: 'template_id' })
  public template: MaToolTemplate;

  // user_id: plain nullable int, no decorator
  @Column({ nullable: true, type: 'int' })
  public user_id: number;
}
