import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity, Index } from 'typeorm';

/**
 * Source table for the bulk group-role sync API.
 * Seeded externally; each row maps one user (by email_user) to a group_role of a given type.
 * Rows sharing the same group_role are collapsed into a single role during sync.
 */
@Entity('group_role_mappings')
export class GroupRoleMapping extends BaseSoftDeleteEntity {
  @Column()
  public type: string;

  // Grouping key: all rows with the same group_role produce/target one role (role.name = group_role).
  @Index()
  @Column()
  public group_role: string;

  // Bare user identifier (e.g. HOANGPH12); resolved to a real user via lower(email_user)+domain.
  @Column()
  public email_user: string;
}
