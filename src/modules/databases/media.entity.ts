import { BaseSoftDeleteEntity } from '../../configuration/base-entity';
import { Column, Entity } from 'typeorm';

@Entity('media')
export class Media extends BaseSoftDeleteEntity {
  @Column({ type: 'varchar', nullable: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  alternative_text: string;

  @Column({ type: 'text', nullable: true })
  caption: string;

  @Column({ type: 'int', nullable: true })
  width: number;

  @Column({ type: 'int', nullable: true })
  height: number;

  @Column({ type: 'jsonb', nullable: true })
  formats: Record<string, any>;

  @Column({ type: 'varchar', nullable: true })
  hash: string;

  @Column({ type: 'varchar', nullable: true })
  ext: string;

  @Column({ type: 'varchar', nullable: true })
  mime: string;

  @Column({ type: 'numeric', nullable: true })
  size: number;

  @Column({ type: 'text', nullable: true })
  url: string;

  @Column({ type: 'text', nullable: true })
  preview_url: string;

  @Column({ type: 'varchar', nullable: true })
  provider: string;

  @Column({ type: 'jsonb', nullable: true })
  provider_metadata: Record<string, any>;

  @Column({ type: 'varchar', nullable: true })
  folder_path: string;

  @Column({ type: 'int', nullable: true })
  created_by_id: number;

  @Column({ type: 'int', nullable: true })
  updated_by_id: number;

  @Column({ type: 'varchar', nullable: true })
  locale: string;

  @Column({ type: 'jsonb', nullable: true })
  focal_point: Record<string, any>;
}
