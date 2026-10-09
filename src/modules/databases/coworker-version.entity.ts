import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { CoworkerPackage } from './coworker-package.entity';
import { AssetHubTagKind } from './asset-hub-tag.entity';

export enum CoworkerVersionState {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('coworker_versions')
export class CoworkerVersion extends BaseSoftDeleteEntity {
  @Column({ type: 'int' })
  public coworker_package_id: number;

  @ManyToOne(() => CoworkerPackage, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'coworker_package_id' })
  public coworker_package: CoworkerPackage;

  @Column({ type: 'int' })
  public version_no: number;

  @Column({ type: 'int', nullable: true })
  public old_version: number | null;

  @Column({ type: 'varchar', default: CoworkerVersionState.PENDING })
  public state: CoworkerVersionState;

  @Column({ type: 'varchar' })
  public name: string;

  @Column({ type: 'text' })
  public short_description: string;

  @Column({ type: 'varchar', length: 20, default: AssetHubTagKind.PERSONAL })
  public kind: AssetHubTagKind;

  @Column({ type: 'varchar', nullable: true })
  public avatar_url: string | null;

  @Column({ type: 'int' })
  public model_id: number;

  @Column({ type: 'varchar' })
  public link: string;

  @Column({ type: 'text', nullable: true })
  public changelog_note: string | null;

  @Column({ type: 'int' })
  public submitted_by: number;

  @Column({ type: 'int', nullable: true })
  public reviewed_by: number | null;

  @Column({ type: 'timestamp without time zone', nullable: true })
  public reviewed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  public reject_reason: string | null;
}
