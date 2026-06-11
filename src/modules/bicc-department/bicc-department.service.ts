import { PaginationParams } from '@common/decorators/pagination.decorator';
import { SortParams } from '@common/decorators/sort.decorator';
import { execQueryPaignation } from '@common/utils';
import { BiHubBiccDepartment } from '@modules/databases/bi-hub-bicc-department.entity';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateBiccDepartmentDto, SearchBiccDepartmentDto, UpdateBiccDepartmentDto } from './dto';
import { CreatorAccessGrantService } from '@modules/data-access/services/creator-access-grant.service';

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
    accessibleDataIds?: number[],
  ) {
    const qb = this.biccDeptRepo
      .createQueryBuilder('dept')
      .where('dept.deleted_at IS NULL');

    // Record-level access filtering
    if (accessibleDataIds && accessibleDataIds.length > 0) {
      qb.andWhere('dept.id IN (:...accessibleDataIds)', { accessibleDataIds });
    } else if (accessibleDataIds && accessibleDataIds.length === 0) {
      // User has no accessible records — return empty
      return { data: [], meta: { totalItems: 0, itemCount: 0, itemsPerPage: pagination.limit, totalPages: 0, currentPage: pagination.page } };
    }

    if (query.keyword) {
      const keyword = query.keyword.trim();
      qb.andWhere('(dept.name ILIKE :keyword OR dept.code ILIKE :keyword)', {
        keyword: `%${keyword}%`,
      });
    }

    qb.orderBy(`dept.${sortParams.sort_field}`, sortParams.sort_order as 'ASC' | 'DESC');

    return execQueryPaignation(qb, pagination.page, pagination.limit);
  }

  async details(id: number) {
    const dept = await this.biccDeptRepo.findOne({
      where: { id },
      relations: ['reports', 'diagnostic_reports'],
    });
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
