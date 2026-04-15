import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

// Service-level key/value configuration for MA Tool
@Entity('ma_tool_service_configs')
export class MaToolServiceConfig extends BaseSoftDeleteEntity {
  @Column({ nullable: true })
  public service_name: string;

  @Column({ nullable: true })
  public config_key: string;

  @Column({ nullable: true, type: 'jsonb' })
  public config_value: object;
}
