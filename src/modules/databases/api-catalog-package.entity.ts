import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';
import type { ApiVersion } from './api-catalog-version.entity';

export enum ApiPackageStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('ai_api_catalog_packages')
export class ApiPackage extends BaseSoftDeleteEntity {
  @Column({ nullable: true, type: 'int' })
  public active_version_id: number | null;

  @Column({ type: 'varchar', default: ApiPackageStatus.ACTIVE })
  public status: ApiPackageStatus;

  @Column({ type: 'varchar' })
  public code: string;

  @Column({ type: 'int' })
  public created_by: number;

  @Column({ type: 'int' })
  public publisher_id: number;

  // JSON owning_unit_name (Trung tâm/phòng ban chủ quản). Optional freetext; khối chủ quản is publisher_id.
  @Column({ type: 'varchar', length: 500, nullable: true })
  public owning_unit_name: string | null;

  // Hydrated in query services by active_version_id — not a TypeORM relation (no circular FK).
  public active_version?: ApiVersion | null;
}
