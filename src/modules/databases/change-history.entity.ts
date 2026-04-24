import { CHANGE_ACTION_TYPE, CHANGE_ENTITY_TYPE } from '@common/enums';
import { BaseSoftDeleteEntity } from '@configuration/base-entity';
import { Column, Entity } from 'typeorm';

/**
 * Tracks changes to role, user, and data_access entities in MTPQ.
 * Each row = 1 change event: who changed what, when, which fields, old vs new values.
 */
@Entity('change_historys')
export class ChangeHistory extends BaseSoftDeleteEntity {
  // What type of entity was changed: role | user | data_access
  @Column({ enum: CHANGE_ENTITY_TYPE })
  public entity_type: CHANGE_ENTITY_TYPE;

  // What action: create | update | delete
  @Column({ enum: CHANGE_ACTION_TYPE })
  public action_type: CHANGE_ACTION_TYPE;

  // Which record was changed (ID as string for flexibility)
  @Column({ nullable: true })
  public entity_id: string;

  // Display name of the changed record (for quick lookup without joining)
  @Column({ nullable: true })
  public entity_name: string;

  // Who performed the change (username or user ID)
  @Column()
  public performed_by: string;

  // List of field names that were changed (e.g. ["name", "permissions", "scope_type"])
  @Column({ type: 'jsonb', nullable: true })
  public changed_fields: string[];

  // Snapshot of old values (JSON object with only the changed fields)
  @Column({ type: 'jsonb', nullable: true })
  public old_value: Record<string, any>;

  // Snapshot of new values (JSON object with only the changed fields)
  @Column({ type: 'jsonb', nullable: true })
  public new_value: Record<string, any>;
}
