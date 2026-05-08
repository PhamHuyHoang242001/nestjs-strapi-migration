import { Column } from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

// Base entity with user author tracking (created_by, updated_by) + soft delete
export abstract class BaseAuthorUserSoftDeleteColumn extends BaseSoftDeleteEntity {
  @Column({ type: 'int', nullable: true })
  public created_by_user_id: number;

  @Column({ type: 'int', nullable: true })
  public updated_by_user_id: number;
}
