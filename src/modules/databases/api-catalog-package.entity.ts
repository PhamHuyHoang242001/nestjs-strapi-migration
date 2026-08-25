import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import type { ApiVersion } from './api-catalog-version.entity';

export enum ApiPackageStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('api_catalog_packages')
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

  @OneToOne('ApiVersion', { nullable: true, eager: false })
  @JoinColumn({ name: 'active_version_id' })
  public active_version: ApiVersion | null;
}
