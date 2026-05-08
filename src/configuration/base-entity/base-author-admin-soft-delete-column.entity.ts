import { Column, JoinColumn, ManyToOne } from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

// Base entity with admin author tracking (created_by, updated_by) + soft delete
export abstract class BaseAuthorAdminSoftDeleteColumn extends BaseSoftDeleteEntity {
  @Column({ type: 'int', nullable: true })
  public created_by_admin_id: number;

  @Column({ type: 'int', nullable: true })
  public updated_by_admin_id: number;
}
