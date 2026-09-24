import { Entity, Column } from 'typeorm';
import { BaseAuthorUserSoftDeleteColumn } from '@configuration/base-entity/base-author-user-soft-delete-column.entity';

@Entity('configs')
export class Config extends BaseAuthorUserSoftDeleteColumn {
  @Column({ type: 'varchar', nullable: false, unique: true })
  key?: string;

  @Column({ type: 'jsonb', nullable: true })
  value?: string;
}
