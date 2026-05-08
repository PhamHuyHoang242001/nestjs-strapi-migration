import { SortParams } from '@common/decorators/sort.decorator';
import { BaseRepository } from '@common/repository/base-repository';
import { DataAccess } from '@modules/databases/data-access.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { SearchDataAccessDto } from '../dto/search-data-access.dto';

@Injectable()
export class DataAccessRepository extends BaseRepository<DataAccess> {
  constructor(private dataSource: DataSource) {
    super(DataAccess, dataSource);
  }

  buildSearchQuery(dto: SearchDataAccessDto, sortParams?: SortParams): SelectQueryBuilder<DataAccess> {
    const query = this.createQueryBuilder('da')
      .leftJoinAndSelect('da.module', 'module')
      .leftJoinAndSelect('da.role_data_access', 'rda')
      .leftJoinAndSelect('rda.role', 'role')
      .leftJoinAndSelect('da.user_data_access', 'uda')
      .leftJoinAndSelect('uda.user', 'user')
      .leftJoinAndSelect('uda.permission', 'permission');

    // subject_type filter: 'role' = has roles assigned, 'user' = has users assigned
    if (dto.subject_type === 'role') {
      query.andWhere('rda.id IS NOT NULL');
    } else if (dto.subject_type === 'user') {
      query.andWhere('uda.id IS NOT NULL');
    }

    if (dto.role_id) {
      query.andWhere('rda.role_id = :role_id', { role_id: dto.role_id });
    }

    if (dto.user_id) {
      query.andWhere('uda.user_id = :user_id', { user_id: dto.user_id });
    }

    if (dto.module_id) {
      query.andWhere('da.module_id = :module_id', { module_id: dto.module_id });
    }

    if (dto.scope_type) {
      query.andWhere('da.scope_type = :scope_type', { scope_type: dto.scope_type });
    }

    if (dto.search) {
      query.andWhere(
        '(CAST(da.data_id AS TEXT) ILIKE :search OR unaccent(role.name) ILIKE unaccent(:search) OR unaccent(user.full_name) ILIKE unaccent(:search))',
        { search: `%${dto.search}%` },
      );
    }

    const sortField = sortParams?.sort_field ? `da.${sortParams.sort_field}` : 'da.created_at';
    const sortOrder = sortParams?.sort_order || 'DESC';
    query.orderBy(sortField, sortOrder);

    return query;
  }
}
