import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { MaToolTemplate } from './ma-tool-template.entity';

// Audit history record for MA Tool template changes
@Entity('ma_tool_template_histories')
export class MaToolTemplateHistory extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public action: string;

  @Column({ nullable: true })
  public action_by: string;

  @Column({ nullable: true, type: 'timestamp without time zone' })
  public action_at: Date;

  @Column({ nullable: true, type: 'jsonb' })
  public old_value: object;

  @Column({ nullable: true, type: 'jsonb' })
  public new_value: object;

  // FK to ma_tool_templates
  @Column({ nullable: false, type: 'int' })
  public template_id: number;

  @ManyToOne(() => MaToolTemplate, (t) => t.histories)
  @JoinColumn({ name: 'template_id' })
  public template: MaToolTemplate;

  // user_id: plain nullable int, no decorator
  @Column({ nullable: true, type: 'int' })
  public user_id: number;
}
