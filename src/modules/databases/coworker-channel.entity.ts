import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

@Entity('ai_hub_coworker_channels')
export class CoworkerChannel extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar' })
  public name: string;

  // Allowed origin(s) for links on this channel, comma-separated (e.g. "https://teams.microsoft.com").
  // NULL/empty = not configured; writes using this channel are rejected.
  @Column({ type: 'varchar', nullable: true })
  public domain: string | null;

  // How links are matched against `domain`: 'prefix' (URL origin, default when NULL) or 'suffix'
  // (value ends with an entry, e.g. "@vpbank.com.vn" for an Outlook address).
  @Column({ type: 'varchar', nullable: true })
  public type: string | null;
}
