import { SortParams } from '@common/decorators/sort.decorator';
import { BaseRepository } from '@common/repository/base-repository';
import { NOT_FOUND } from '@constant/error-messages';
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { ListPermissionDto } from '../dto';
import { Permission } from '../../databases/permission.entity';

@Injectable()
export class PermissionRepository extends BaseRepository<Permission> {
  constructor(private dataSource: DataSource) {
    super(Permission, dataSource);
  }

  buildQueryBuilderPermission({ search }: ListPermissionDto, sortParams: SortParams): SelectQueryBuilder<Permission> {
    const query = this.createQueryBuilder('permission');
    if (search) query.where('unaccent(permission.name) ILIKE unaccent(:name)', { name: `%${search}%` });
    if (sortParams.sort_field) query.orderBy(`permission.${sortParams.sort_field}`, sortParams.sort_order);
    query.leftJoinAndSelect('permission.screen', 'screen');
    return query;
  }

  async findDetailRelation(id: number): Promise<Permission | undefined> {
    const rs = await this.findOne({ where: { id }, relations: ['screen'] });
    if (!rs) throw new NotFoundException(NOT_FOUND);
    return rs;
  }
}
