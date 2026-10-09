import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

@Entity('ai_hub_coworker_models')
export class CoworkerModel extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar' })
  public name: string;
}
