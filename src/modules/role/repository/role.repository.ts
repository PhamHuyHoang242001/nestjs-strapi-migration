import { SortParams } from '@common/decorators/sort.decorator';
import { BaseRepository } from '@common/repository/base-repository';
import { NOT_FOUND } from '@constant/error-messages';
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { ListRoleDto } from '../dto';
import { Role } from '../../databases/role.entity';

@Injectable()
export class RoleRepository extends BaseRepository<Role> {
  constructor(private dataSource: DataSource) {
    super(Role, dataSource);
  }

  buildQueryBuilderRole({ search }: ListRoleDto, sortParams: SortParams): SelectQueryBuilder<Role> {
    const query = this.createQueryBuilder('role');
    if (search) query.where('unaccent(name) ILIKE unaccent(:name)', { name: `%${search}%` });
    if (sortParams.sort_field) query.orderBy(`${sortParams.sort_field}`, sortParams.sort_order);
    // query;
    return query;
  }

  async findDetailRelation(id: number): Promise<Role | undefined> {
    const rs = await this.findOne({ where: { id }, relations: ['permissions'] });
    if (!rs) throw new NotFoundException(NOT_FOUND);
    return rs;
  }

  async findDetailRelationWithModule(id: number): Promise<Role | undefined> {
    const rs = await this.findOne({ where: { id }, relations: ['permissions', 'permissions.module'] });
    if (!rs) throw new NotFoundException(NOT_FOUND);
    return rs;
  }
}
