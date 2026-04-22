import { Injectable } from '@nestjs/common';
import { ChangeHistoryRepository } from './repository/change-history.repository';

@Injectable()
export class ChangeHistoryLogger {
  constructor(private readonly repository: ChangeHistoryRepository) {}

  async log(params: {
    entity_type: string;
    action_type: string;
    entity_id?: string;
    entity_name?: string;
    performed_by: string;
    old_value?: any;
    new_value?: any;
    description: string;
  }) {
    await this.repository.save({
      ...params,
      old_value: params.old_value != null ? JSON.stringify(params.old_value) : null,
      new_value: params.new_value != null ? JSON.stringify(params.new_value) : null,
    } as any);
  }
}
