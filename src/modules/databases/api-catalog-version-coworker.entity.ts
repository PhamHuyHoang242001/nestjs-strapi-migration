import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

// Version ↔ coworker_packages. Replaces api_catalog_version_tags → ai_hub_tags.
@Entity('api_catalog_version_coworkers')
export class ApiVersionCoworker extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public api_catalog_version_id: number;

  @Column({ type: 'int' })
  public coworker_package_id: number;
}
