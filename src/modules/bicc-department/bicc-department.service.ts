import { PaginationParams } from '@common/decorators/pagination.decorator';
import { SortParams } from '@common/decorators/sort.decorator';
import { execQueryPaignation } from '@common/utils';
import { BiHubBiccDepartment } from '@modules/databases/bi-hub-bicc-department.entity';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateBiccDepartmentDto, SearchBiccDepartmentDto, UpdateBiccDepartmentDto } from './dto';
import { CreatorAccessGrantService } from '@modules/data-access/services/creator-access-grant.service';
import type { DataScope } from '@common/authorization/types/data-scope.types';
import { applyDataScope } from '@modules/data-access/helpers/data-scope-applier';

const BICC_DEPT_TABLE = 'bi_hub_bicc_departments';

@Injectable()
export class BiccDepartmentService {
  constructor(
    @InjectRepository(BiHubBiccDepartment)
    private readonly biccDeptRepo: Repository<BiHubBiccDepartment>,
    private readonly dataSource: DataSource,
    private readonly creatorAccessGrant: CreatorAccessGrantService,
  ) {}

  async search(
    query: SearchBiccDepartmentDto,
    sortParams: SortParams,
    pagination: PaginationParams,
    scope: DataScope | null,
  ) {
    const qb = this.biccDeptRepo
      .createQueryBuilder('dept')
      .where('dept.deleted_at IS NULL');

    applyDataScope(qb, 'dept', BICC_DEPT_TABLE, scope);

    if (query.keyword) {
      const keyword = query.keyword.trim();
      qb.andWhere('(dept.name ILIKE :keyword OR dept.code ILIKE :keyword)', {
        keyword: `%${keyword}%`,
      });
    }

    qb.orderBy(`dept.${sortParams.sort_field}`, sortParams.sort_order as 'ASC' | 'DESC');

    return execQueryPaignation(qb, pagination.page, pagination.limit);
  }

  // 404 covers both "missing" and "out-of-scope" to avoid existence leak.
  async details(id: number, scope: DataScope | null) {
    const qb = this.biccDeptRepo
      .createQueryBuilder('dept')
      .leftJoinAndSelect('dept.reports', 'reports')
      .leftJoinAndSelect('dept.diagnostic_reports', 'diagnostic_reports')
      .where('dept.id = :id', { id });
    applyDataScope(qb, 'dept', BICC_DEPT_TABLE, scope);
    const dept = await qb.getOne();
    if (!dept) throw new NotFoundException('BICC Department not found');
    return dept;
  }

  async create(dto: CreateBiccDepartmentDto, userId?: number) {
    if (dto.code) {
      const existing = await this.biccDeptRepo.findOne({ where: { code: dto.code } });
      if (existing) throw new BadRequestException('Department code already exists');
    }

    let accessGranted = false;

    const result = await this.dataSource.transaction(async (manager) => {
      const entity = manager.create(BiHubBiccDepartment, dto as Partial<BiHubBiccDepartment>);
      const saved = await manager.save(entity);

      if (userId) {
        accessGranted = await this.creatorAccessGrant.grantCreatorAccess(manager, {
          tableName: 'bi_hub_bicc_departments',
          dataId: saved.id,
          userId,
        });
      }

      return { id: saved.id };
    });

    // Invalidate cache AFTER transaction commits to avoid stale cache race condition
    if (accessGranted && userId) {
      this.creatorAccessGrant.invalidateUserCache(userId).catch(() => {});
    }

    return result;
  }

  async update(id: number, dto: UpdateBiccDepartmentDto) {
    const dept = await this.biccDeptRepo.findOne({ where: { id } });
    if (!dept) throw new NotFoundException('BICC Department not found');

    if (dto.code && dto.code !== dept.code) {
      const existing = await this.biccDeptRepo.findOne({ where: { code: dto.code } });
      if (existing) throw new BadRequestException('Department code already exists');
    }

    Object.assign(dept, dto);
    await this.biccDeptRepo.save(dept);
    return { id: dept.id };
  }

  async delete(id: number) {
    const dept = await this.biccDeptRepo.findOne({ where: { id } });
    if (!dept) throw new NotFoundException('BICC Department not found');
    await this.biccDeptRepo.softRemove(dept);
    return { id: dept.id };
  }
}
