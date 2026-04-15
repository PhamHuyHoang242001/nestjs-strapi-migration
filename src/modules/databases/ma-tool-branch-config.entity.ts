import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Branch-level configuration for MA Tool workflows
@Entity('ma_tool_branch_configs')
export class MaToolBranchConfig extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public branch_code: string;

  @Column({ nullable: true })
  public branch_name: string;

  @Column({ nullable: true })
  public branch_status: string;

  @Column({ nullable: true, type: 'jsonb' })
  public configuration: object;
}
