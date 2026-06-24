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

// The two report types that live under a bicc. Each contributes its own
// {isCreate,isDownload,isDelete} capability block to details(), derived from its own
// child table + verb codes. create = parent-bound (a NEW report under the bicc);
// download/delete additionally honor per-report exceptions on the child table.
const REPORT_TYPES = {
  diagnostic: {
    table: 'bi_hub_diagnostic_reports',
    create: 'bh_diag_report_create',
    download: 'bh_diag_report_download',
    delete: 'bh_diag_report_delete',
  },
  descriptive: {
    table: 'bi_hub_reports',
    create: 'bh_report_create',
    download: 'bh_report_download',
    delete: 'bh_report_delete',
  },
} as const;

type ReportTypeConfig = (typeof REPORT_TYPES)[keyof typeof REPORT_TYPES];

// Caller identity needed to derive capability flags. Built in the controller from
// req.info.user; null userId (anonymous contract) yields no capability.
export interface ReportCapAuth {
  userId: number | null;
  isSuperAdmin: boolean;
}

export interface ReportCapFlags {
  isCreate: boolean;
  isDownload: boolean;
  isDelete: boolean;
}

// Per-report-type capability blocks merged onto the details() response.
export interface BiccCapabilities {
  diagnostic: ReportCapFlags;
  descriptive: ReportCapFlags;
}

const allFlags = (value: boolean): ReportCapFlags => ({ isCreate: value, isDownload: value, isDelete: value });

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
      .leftJoinAndSelect('dept.bi_hub_reports', 'bi_hub_reports')
      .leftJoinAndSelect('dept.bi_hub_diagnostic_reports', 'bi_hub_diagnostic_reports')
      .where('dept.id = :id', { id })
      .getOne();
    if (!dept) throw new NotFoundException('BICC Department not found');
    await this.assertDeptInScope(id, scope);

    const caps = await this.resolveBiccCapabilities(id, auth);
    // Attach onto the loaded entity to preserve eager relations in the response.
    return Object.assign(dept, caps);
  }

  // ── Derive bicc-level report capability for the current viewer ──
  // Returns a flag block per report type (diagnostic + descriptive). Within each type:
  // a flag is true when THIS bicc carries a data-access grant for the verb via a role/user
  // the caller holds, OR the bicc is in the caller's owner (SO) scope; download/delete are
  // additionally true when the caller can act on ≥1 existing child report of that type
  // under the bicc (per-report user/role exception). super_admin → all; no userId → none.
  private async resolveBiccCapabilities(biccId: number, auth: ReportCapAuth | null): Promise<BiccCapabilities> {
    if (!auth?.userId) return { diagnostic: allFlags(false), descriptive: allFlags(false) };
    if (auth.isSuperAdmin) return { diagnostic: allFlags(true), descriptive: allFlags(true) };
    const userId = auth.userId;

    const [diagnostic, descriptive] = await Promise.all([
      this.resolveReportTypeFlags(userId, biccId, REPORT_TYPES.diagnostic),
      this.resolveReportTypeFlags(userId, biccId, REPORT_TYPES.descriptive),
    ]);
    return { diagnostic, descriptive };
  }

  // Resolve one report type's flags against a bicc.
  // create = parent-bound only (a NEW report under the bicc → bicc grant or SO).
  // download/delete act on EXISTING reports → also true if the caller can act on ≥1 child
  // report of this type under the bicc. The || short-circuits the child probe when a
  // bicc-bound grant already covers the verb.
  private async resolveReportTypeFlags(
    userId: number,
    biccId: number,
    type: ReportTypeConfig,
  ): Promise<ReportCapFlags> {
    const resolveChildVerb = async (verb: string): Promise<boolean> =>
      (await this.ownerScope.canCreateUnderParent(userId, BICC_DEPT_TABLE, biccId, verb)) ||
      (await this.ownerScope.hasAccessibleChildUnderParent(userId, type.table, biccId, verb));

    const [isCreate, isDownload, isDelete] = await Promise.all([
      this.ownerScope.canCreateUnderParent(userId, BICC_DEPT_TABLE, biccId, type.create),
      resolveChildVerb(type.download),
      resolveChildVerb(type.delete),
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
