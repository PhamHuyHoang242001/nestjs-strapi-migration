import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Validation rule applied to MA Tool sheet data
@Entity('ma_tool_validation_rules')
export class MaToolValidationRule extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public rule_name: string;

  @Column({ nullable: true })
  public rule_type: string;

  @Column({ nullable: true, type: 'jsonb' })
  public rule_condition: object;
}
