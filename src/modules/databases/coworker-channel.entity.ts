import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

@Entity('ai_hub_coworker_channels')
export class CoworkerChannel extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar' })
  public name: string;
}
