import { Column, Entity, Unique } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

export enum DomainStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum DomainType {
  INTERNAL = 'internal',
  PARTNER = 'partner',
}

// Integration domain config: gateway origins (such as https://api-int.vpbank.com.vn) shared across the system;
// Data Hub API specs point to one via domain_id. url is stored normalized (lower case, no trailing /), one row per url.
@Entity('integration_domain_configs')
@Unique('uq_integration_domain_configs_url', ['url'])
export class IntegrationDomainConfig extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar', length: 255 })
  public url: string;

  @Column({ type: 'varchar', length: 50, default: DomainStatus.ACTIVE })
  public status: DomainStatus;

  @Column({ type: 'varchar', length: 50 })
  public type: DomainType;

  @Column({ type: 'int', nullable: true })
  public created_by: number | null;

  @Column({ type: 'int', nullable: true })
  public updated_by: number | null;

  @Column({ type: 'int', nullable: true })
  public deleted_by: number | null;
}
