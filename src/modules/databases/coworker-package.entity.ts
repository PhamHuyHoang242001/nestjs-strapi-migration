import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';
import type { CoworkerVersion } from './coworker-version.entity';

export enum CoworkerPackageStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('coworker_packages')
export class CoworkerPackage extends BaseSoftDeleteEntity {
  @Column({ nullable: true, type: 'int' })
  public active_version_id: number | null;

  @Column({ type: 'varchar', default: CoworkerPackageStatus.ACTIVE })
  public status: CoworkerPackageStatus;

  @Column({ type: 'varchar', length: 100 })
  public code: string;

  @Column({ type: 'int' })
  public created_by: number;

  @Column({ type: 'int' })
  public publisher_id: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  public owning_unit_name: string | null;

  public active_version?: CoworkerVersion | null;
}
