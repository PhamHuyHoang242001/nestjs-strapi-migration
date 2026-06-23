import { PaginationParams } from '@common/decorators/pagination.decorator';
import { SortParams } from '@common/decorators/sort.decorator';
import { execQueryPaignation } from '@common/utils';
import { BiHubBiccDepartment } from '@modules/databases/bi-hub-bicc-department.entity';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateBiccDepartmentDto, SearchBiccDepartmentDto, UpdateBiccDepartmentDto } from './dto';
import { CreatorAccessGrantService } from '@modules/data-access/services/creator-access-grant.service';
import type { DataScope } from '@common/authorization/types/data-scope.types';
import { applyDataScope } from '@modules/data-access/helpers/data-scope-applier';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';

const BICC_DEPT_TABLE = 'bi_hub_bicc_departments';

// Report verbs whose holders may act inside a bicc. Used to derive the bicc-level
// isCreate/isDownload/isDelete capability flags returned by details().
const DIAG_CREATE_VERB = 'bh_diag_report_create';
const DIAG_DOWNLOAD_VERB = 'bh_diag_report_download';
const DIAG_DELETE_VERB = 'bh_diag_report_delete';

// Caller identity needed to derive capability flags. Built in the controller from
// req.info.user; null userId (anonymous contract) yields no capability.
export interface ReportCapAuth {
  userId: number | null;
  isSuperAdmin: boolean;
}

@Injectable()
export class BiccDepartmentService {
  constructor(
    @InjectRepository(BiHubBiccDepartment)
    private readonly biccDeptRepo: Repository<BiHubBiccDepartment>,
    private readonly dataSource: DataSource,
    private readonly creatorAccessGrant: CreatorAccessGrantService,
    private readonly ownerScope: OwnerScopeResolverService,
  ) {}

  async search(
    query: SearchBiccDepartmentDto,
    sortParams: SortParams,
    pagination: PaginationParams,
    scope: DataScope | null,
  ) {
    const qb = this.biccDeptRepo.createQueryBuilder('dept').where('dept.deleted_at IS NULL');

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

  // 404 = department truly absent. 403 = exists but outside caller's data scope.
  // Existence is intentionally exposed so callers see a clear permission error.
  async details(id: number, scope: DataScope | null, auth: ReportCapAuth | null = null) {
    const dept = await this.biccDeptRepo
      .createQueryBuilder('dept')
      .leftJoinAndSelect('dept.reports', 'reports')
      .leftJoinAndSelect('dept.diagnostic_reports', 'diagnostic_reports')
      .where('dept.id = :id', { id })
      .getOne();
    if (!dept) throw new NotFoundException('BICC Department not found');
    await this.assertDeptInScope(id, scope);

    const caps = await this.resolveBiccCapabilities(id, auth);
    // Attach onto the loaded entity to preserve eager relations in the response.
    return Object.assign(dept, caps);
  }

  // ── Derive bicc-level report capability for the current viewer ──
  // Each flag is true when THIS bicc carries a data-access grant for the report verb
  // through a role/user the caller holds, OR the bicc falls within the caller's owner
  // (SO) scope. canCreateUnderParent folds both branches over the bicc as the parent
  // record: (accessible-records for the verb) ∪ (owned-scope). super_admin → all;
  // no userId → none.
  private async resolveBiccCapabilities(
    biccId: number,
    auth: ReportCapAuth | null,
  ): Promise<{ isCreate: boolean; isDownload: boolean; isDelete: boolean }> {
    if (!auth?.userId) return { isCreate: false, isDownload: false, isDelete: false };
    if (auth.isSuperAdmin) return { isCreate: true, isDownload: true, isDelete: true };
    const userId = auth.userId;

    const resolveVerb = (verb: string): Promise<boolean> =>
      this.ownerScope.canCreateUnderParent(userId, BICC_DEPT_TABLE, biccId, verb);

    const [isCreate, isDownload, isDelete] = await Promise.all([
      resolveVerb(DIAG_CREATE_VERB),
      resolveVerb(DIAG_DOWNLOAD_VERB),
      resolveVerb(DIAG_DELETE_VERB),
    ]);
    return { isCreate, isDownload, isDelete };
  }

  // Scope-check helper — single SQL existence probe via applyDataScope predicate.
  private async assertDeptInScope(id: number, scope: DataScope | null): Promise<void> {
    if (scope === null) return; // admin bypass
    const qb = this.biccDeptRepo.createQueryBuilder('dept').select('1', 'one').where('dept.id = :id', { id });
    applyDataScope(qb, 'dept', BICC_DEPT_TABLE, scope);
    const ok = await qb.getRawOne();
    if (!ok) throw new ForbiddenException('No permission');
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
