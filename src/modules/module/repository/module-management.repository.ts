import { SortParams } from '@common/decorators/sort.decorator';
import { NOT_FOUND } from '@constant/error-messages';
import { Module } from '@modules/databases/module.entity';
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, SelectQueryBuilder, TreeRepository } from 'typeorm';
import { ListModuleDto } from '../dto/list-module.dto';

@Injectable()
export class ModuleManagementRepository extends TreeRepository<Module> {
  constructor(private dataSource: DataSource) {
    super(Module, dataSource.createEntityManager());
  }

  buildQueryBuilder({ search }: ListModuleDto, sortParams: SortParams): SelectQueryBuilder<Module> {
    const query = this.createQueryBuilder('module');
    if (search) query.where('unaccent(module.name) ILIKE unaccent(:name)', { name: `%${search}%` });
    if (sortParams.sort_field) query.orderBy(`module.${sortParams.sort_field}`, sortParams.sort_order);
    return query;
  }

  async findDetailWithRelations(id: number): Promise<Module> {
    const mod = await this.findOne({ where: { id }, relations: ['children', 'permissions'] });
    if (!mod) throw new NotFoundException(NOT_FOUND);
    return mod;
  }

  /** Find one by id, throw NotFoundException if not found */
  async findOneByIdValid(id: number): Promise<Module> {
    const mod = await this.findOneBy({ id });
    if (!mod) throw new NotFoundException(NOT_FOUND);
    return mod;
  }
}
