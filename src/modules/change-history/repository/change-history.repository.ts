import { BaseRepository } from '@common/repository/base-repository';
import { SortParams } from '@common/decorators/sort.decorator';
import { ChangeHistory } from '@modules/databases/change-history.entity';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SearchChangeHistoryDto } from '../dto/search-change-history.dto';

@Injectable()
export class ChangeHistoryRepository extends BaseRepository<ChangeHistory> {
  constructor(dataSource: DataSource) {
    super(ChangeHistory, dataSource);
  }

  buildSearchQuery(dto: SearchChangeHistoryDto, sortParams: SortParams) {
    const query = this.createQueryBuilder('ch');

    if (dto.entity_type) query.andWhere('ch.entity_type = :et', { et: dto.entity_type });
    if (dto.action_type) query.andWhere('ch.action_type = :at', { at: dto.action_type });
    if (dto.performed_by)
      query.andWhere('unaccent(ch.performed_by) ILIKE unaccent(:pb)', { pb: `%${dto.performed_by}%` });
    if (dto.date_from) query.andWhere('ch.created_at >= :df', { df: dto.date_from });
    if (dto.date_to) query.andWhere('ch.created_at <= :dt', { dt: dto.date_to });
    if (dto.search)
      query.andWhere(
        '(unaccent(ch.entity_name) ILIKE unaccent(:s) OR CAST(ch.entity_id AS TEXT) ILIKE :s OR unaccent(ch.performed_by) ILIKE unaccent(:s))',
        { s: `%${dto.search}%` },
      );

    if (sortParams?.sort_field) query.orderBy(`ch.${sortParams.sort_field}`, sortParams.sort_order);
    else query.orderBy('ch.created_at', 'DESC');

    return query;
  }
}
