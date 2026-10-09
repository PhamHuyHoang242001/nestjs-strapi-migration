import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

@Entity('coworker_version_channels')
export class CoworkerVersionChannel extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public coworker_version_id: number;

  @Column({ type: 'int' })
  public channel_id: number;
}
