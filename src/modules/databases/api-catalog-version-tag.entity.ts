import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

@Entity('api_catalog_version_tags')
export class ApiVersionTag extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public api_catalog_version_id: number;

  @Column({ type: 'int' })
  public tag_id: number;
}
