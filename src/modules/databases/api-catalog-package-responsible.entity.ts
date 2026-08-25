import { Column, Entity } from 'typeorm';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';

@Entity('api_catalog_package_responsibles')
export class ApiPackageResponsible extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public api_catalog_package_id: number;

  @Column({ type: 'int' })
  public user_id: number;
}
