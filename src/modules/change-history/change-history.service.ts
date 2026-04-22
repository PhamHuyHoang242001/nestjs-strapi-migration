import { PaginationParams } from '@common/decorators/pagination.decorator';
import { SortParams } from '@common/decorators/sort.decorator';
import { execQueryAll, execQueryPaignation } from '@common/utils/common';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SearchChangeHistoryDto } from './dto/search-change-history.dto';
import { ChangeHistoryRepository } from './repository/change-history.repository';

@Injectable()
export class ChangeHistoryService {
  constructor(
    private readonly repository: ChangeHistoryRepository,
    private readonly dataSource: DataSource,
  ) {}

  async search(dto: SearchChangeHistoryDto, sortParams: SortParams, pagination: PaginationParams) {
    const query = this.repository.buildSearchQuery(dto, sortParams);
    const { page, limit } = pagination;
    return execQueryPaignation(query, page, limit);
  }

  async getStats() {
    const totalResult = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(id)::int AS total FROM change_history WHERE deleted_at IS NULL`,
    );

    const byEntityType = await this.dataSource.query<{ entity_type: string; count: number }[]>(
      `SELECT entity_type, COUNT(id)::int AS count FROM change_history WHERE deleted_at IS NULL GROUP BY entity_type ORDER BY count DESC`,
    );

    const byActionType = await this.dataSource.query<{ action_type: string; count: number }[]>(
      `SELECT action_type, COUNT(id)::int AS count FROM change_history WHERE deleted_at IS NULL GROUP BY action_type ORDER BY count DESC`,
    );

    return {
      total: totalResult[0]?.total ?? 0,
      by_entity_type: byEntityType,
      by_action_type: byActionType,
    };
  }

  async export(dto: SearchChangeHistoryDto) {
    // Use a neutral sort param (default ordering: created_at DESC)
    const query = this.repository.buildSearchQuery(dto, null);
    return execQueryAll(query);
  }

  // Hard deletes all history records — intended for admin/dev use only
  async clear() {
    const count = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(id)::int AS total FROM change_history WHERE deleted_at IS NULL`,
    );
    await this.dataSource.query(`DELETE FROM change_history`);
    return { cleared: true, deleted_count: count[0]?.total ?? 0 };
  }
}
