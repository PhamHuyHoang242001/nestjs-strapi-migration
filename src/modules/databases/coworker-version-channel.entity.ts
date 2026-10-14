import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

@Entity('coworker_version_channels')
export class CoworkerVersionChannel extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public coworker_version_id: number;

  @Column({ type: 'int' })
  public channel_id: number;

  // This channel's optional link for this version; when set, origin must match the channel's domain list.
  @Column({ type: 'varchar', nullable: true })
  public link: string | null;
}
