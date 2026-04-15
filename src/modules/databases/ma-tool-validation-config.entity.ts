import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Global validation configuration defining rules for MA Tool data validation
@Entity('ma_tool_validation_configs')
export class MaToolValidationConfig extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public rule_name: string;

  @Column({ nullable: true })
  public rule_type: string;

  @Column({ nullable: true, type: 'jsonb' })
  public rule_condition: object;

  @Column({ nullable: true })
  public error_message: string;
}
