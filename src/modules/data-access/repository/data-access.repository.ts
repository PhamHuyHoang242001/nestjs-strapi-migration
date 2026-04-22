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
      .leftJoinAndSelect('da.roles', 'roles')
      .leftJoinAndSelect('da.users', 'users')
      .leftJoinAndSelect('da.permissions', 'permissions');

    // subject_type filter: 'role' = has roles assigned, 'user' = has users assigned
    if (dto.subject_type === 'role') {
      query.andWhere('roles.id IS NOT NULL');
    } else if (dto.subject_type === 'user') {
      query.andWhere('users.id IS NOT NULL');
    }

    if (dto.role_id) {
      query.andWhere('roles.id = :role_id', { role_id: dto.role_id });
    }

    if (dto.user_id) {
      query.andWhere('users.id = :user_id', { user_id: dto.user_id });
    }

    if (dto.table_name) {
      query.andWhere('da.table_name ILIKE :table_name', { table_name: `%${dto.table_name}%` });
    }

    if (dto.scope_type) {
      query.andWhere('da.scope_type = :scope_type', { scope_type: dto.scope_type });
    }

    if (dto.search) {
      query.andWhere(
        '(CAST(da.data_id AS TEXT) ILIKE :search OR unaccent(roles.name) ILIKE unaccent(:search) OR unaccent(users.full_name) ILIKE unaccent(:search))',
        { search: `%${dto.search}%` },
      );
    }

    const sortField = sortParams?.sort_field ? `da.${sortParams.sort_field}` : 'da.id';
    const sortOrder = sortParams?.sort_order || 'DESC';
    query.orderBy(sortField, sortOrder);

    return query;
  }
}
