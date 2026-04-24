import { CHANGE_ACTION_TYPE, CHANGE_ENTITY_TYPE } from '@common/enums';
import { Injectable } from '@nestjs/common';
import { ChangeHistoryRepository } from './repository/change-history.repository';

@Injectable()
export class ChangeHistoryLogger {
  constructor(private readonly repository: ChangeHistoryRepository) {}

  /**
   * Log a change event for role/user/data_access.
   * Automatically computes changed_fields from old_value vs new_value if not provided.
   */
  async log(params: {
    entity_type: CHANGE_ENTITY_TYPE;
    action_type: CHANGE_ACTION_TYPE;
    entity_id?: string;
    entity_name?: string;
    performed_by: string;
    changed_fields?: string[];
    old_value?: Record<string, any>;
    new_value?: Record<string, any>;
  }) {
    // Auto-compute changed_fields if not provided (for update actions)
    let changedFields = params.changed_fields;
    if (!changedFields && params.old_value && params.new_value) {
      changedFields = Object.keys(params.new_value).filter(
        (key) => JSON.stringify(params.old_value[key]) !== JSON.stringify(params.new_value[key]),
      );
    }

    await this.repository.save({
      entity_type: params.entity_type,
      action_type: params.action_type,
      entity_id: params.entity_id,
      entity_name: params.entity_name,
      performed_by: params.performed_by,
      changed_fields: changedFields || null,
      old_value: params.old_value || null,
      new_value: params.new_value || null,
    });
  }
}
