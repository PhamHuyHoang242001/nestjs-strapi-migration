import { PaginationParams } from '@common/decorators/pagination.decorator';
import { SortParams } from '@common/decorators/sort.decorator';
import { execQueryAll, execQueryPaignation } from '@common/utils';
import { NOT_FOUND } from '@constant/error-messages';
import { Module as ModuleEntity } from '@modules/databases/module.entity';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateModuleDto } from './dto/create-module.dto';
import { ListModuleDto } from './dto/list-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { ModuleManagementRepository } from './repository/module-management.repository';

@Injectable()
export class ModuleManagementService {
  constructor(private readonly moduleRepository: ModuleManagementRepository) {}

  /**
   * Uses TypeORM TreeRepository.findTrees() to return the full module tree
   * with permissions loaded on each node.
   */
  async getTree(): Promise<{ data: ModuleEntity[] }> {
    const roots = await this.moduleRepository.findTrees({ relations: ['permissions'] });
    return { data: roots };
  }

  /**
   * Get all active modules as a flat list.
   */
  async getAll(): Promise<{ data: ModuleEntity[] }> {
    const data = await this.moduleRepository.find({
      where: { is_active: true },
      order: { id: 'DESC' },
    });
    return { data };
  }

  /**
   * Paginated search with optional full-text search and sorting.
   */
  async search(dto: ListModuleDto, sortParams: SortParams, paginationParams: PaginationParams) {
    const queryBuilder = this.moduleRepository.buildQueryBuilder(dto, sortParams);
    const { page, limit } = paginationParams;
    if (limit === -1) return execQueryAll(queryBuilder);
    return execQueryPaignation(queryBuilder, page, limit);
  }

  /**
   * Get detail of a module with children and permissions relations.
   */
  async details(id: number): Promise<ModuleEntity> {
    return this.moduleRepository.findDetailWithRelations(id);
  }

  /**
   * Create a new module. Validates parent exists if parent_id provided.
   * Uses TreeRepository.save() to auto-manage mpath.
   */
  async create(dto: CreateModuleDto): Promise<{ id: number }> {
    const mod = this.moduleRepository.create({
      name: dto.name,
      path: dto.path,
      table_name: dto.table_name,
      is_active: dto.is_active,
    });

    if (dto.parent_id) {
      const parent = await this.moduleRepository.findOneBy({ id: dto.parent_id });
      if (!parent) throw new NotFoundException(NOT_FOUND);
      mod.parent = parent;
    }

    const saved = await this.moduleRepository.save(mod);
    return { id: saved.id };
  }

  /**
   * Update an existing module by id.
   */
  async update(id: number, dto: UpdateModuleDto): Promise<{ id: number }> {
    const mod = await this.moduleRepository.findOneByIdValid(id);

    if (dto.parent_id !== undefined) {
      if (dto.parent_id) {
        const parent = await this.moduleRepository.findOneBy({ id: dto.parent_id });
        if (!parent) throw new NotFoundException(NOT_FOUND);
        mod.parent = parent;
      } else {
        mod.parent = null;
      }
    }

    Object.assign(mod, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.path !== undefined && { path: dto.path }),
      ...(dto.table_name !== undefined && { table_name: dto.table_name }),
      ...(dto.is_active !== undefined && { is_active: dto.is_active }),
    });

    await this.moduleRepository.save(mod);
    return { id };
  }

  /**
   * Soft-delete a module. Checks no children and no linked permissions exist.
   */
  async delete(id: number) {
    const mod = await this.moduleRepository.findDetailWithRelations(id);
    if (mod.children?.length) {
      throw new BadRequestException('module_has_children_cannot_delete');
    }
    if (mod.permissions?.length) {
      throw new BadRequestException('module_has_permissions_cannot_delete');
    }
    await this.moduleRepository.softDelete({ id });
    return { id };
  }
}
