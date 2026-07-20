import { PaginationParams } from '@common/decorators/pagination.decorator';
import { SortCamelParams } from '../common/decorators/sort-camel.decorator';
import { execQueryPaignation } from '@common/utils';
import { applyDataScope } from '@modules/data-access/helpers/data-scope-applier';
import { CreatorAccessGrantService } from '@modules/data-access/services/creator-access-grant.service';
import { BiPaymentProject } from '@modules/databases/bi-payment-project.entity';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import { DATA_ACCESS_TABLE } from '@common/enums';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { CreateBiPaymentProjectDto, SearchBiPaymentProjectDto, UpdateBiPaymentProjectDto } from './dto';
import type { DataScope } from '@common/authorization/types/data-scope.types';

// bi_payment_projects lives under owner-scope root bi_hub_bicc_departments via the
// bicc_department_id FK. Predicate-pushdown via applyDataScope walks that hierarchy.
const PROJECT_TABLE = 'bi_payment_projects';
const CREATE_PERMISSION = 'bp_project_create';

@Injectable()
export class BiPaymentProjectService {
  constructor(
    @InjectRepository(BiPaymentProject)
    private readonly projectRepo: Repository<BiPaymentProject>,
    private readonly dataSource: DataSource,
    private readonly creatorAccessGrant: CreatorAccessGrantService,
    private readonly ownerScope: OwnerScopeResolverService,
  ) {}

  async search(
    query: SearchBiPaymentProjectDto,
    sortParams: SortCamelParams,
    pagination: PaginationParams,
    scope: DataScope | null,
  ) {
    const qb = this.projectRepo.createQueryBuilder('p').where('p.deleted_at IS NULL');

    applyDataScope(qb, 'p', PROJECT_TABLE, scope);

    if (query.keyword) {
      const keyword = query.keyword.trim();
      qb.andWhere('(p.project_code ILIKE :keyword OR p.project_name ILIKE :keyword)', {
        keyword: `%${keyword}%`,
      });
    }

    qb.orderBy(`p.${sortParams.sort_field}`, sortParams.sort_order as 'ASC' | 'DESC');

    return execQueryPaignation(qb, pagination.page, pagination.limit);
  }

  // 404 if absent; 403 if exists but outside caller's data scope.
  async details(id: number, scope: DataScope | null) {
    const project = await this.projectRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.programs', 'programs')
      .where('p.id = :id', { id })
      .getOne();
    if (!project) throw new NotFoundException('BI Payment project not found');
    await this.assertInScope(id, scope);
    return project;
  }

  // Parent-scope gate: the target bicc_department must be bound (via role or user allow-grant)
  // to a holder of the create verb, or fall within the caller's SO owned scope. super_admin bypasses.
  // Record does not exist yet, so the check is on the parent bi_hub_bicc_departments, not via @RequireOwnerScope.
  async create(dto: CreateBiPaymentProjectDto, userId: number, isSuperAdmin: boolean) {
    if (!isSuperAdmin) {
      const allowed = await this.ownerScope.canCreateUnderParent(
        userId,
        DATA_ACCESS_TABLE.BI_HUB_BICC_DEPARTMENTS,
        dto.biccDepartmentId,
        CREATE_PERMISSION,
      );
      if (!allowed) {
        throw new ForbiddenException('Out of create scope for bi_hub_bicc_departments');
      }
    }

    let accessGranted = false;
    const result = await this.dataSource.transaction(async (manager) => {
      const entity = manager.create(BiPaymentProject, dto as unknown as Partial<BiPaymentProject>);
      const saved = await manager.save(entity);

      if (userId) {
        accessGranted = await this.creatorAccessGrant.grantCreatorAccess(manager, {
          tableName: PROJECT_TABLE,
          dataId: saved.id,
          userId,
        });
      }
      return { id: saved.id };
    });

    // Invalidate cache AFTER transaction commits to avoid stale cache race condition.
    if (accessGranted) {
      this.creatorAccessGrant.invalidateUserCache(userId).catch(() => {});
    }
    return result;
  }

  async update(id: number, dto: UpdateBiPaymentProjectDto) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('BI Payment project not found');
    Object.assign(project, dto);
    await this.projectRepo.save(project);
    return { id: project.id };
  }

  async delete(id: number) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('BI Payment project not found');
    await this.projectRepo.softRemove(project);
    return { id: project.id };
  }

  // delete-many (body ids) — Strapi parity. Filter requested IDs by data-scope predicate
  // before soft-remove: @RequireOwnerScope on the route only covers single-record param path,
  // so the service re-checks each id here to drop out-of-scope rows (defense-in-depth).
  async deleteMany(ids: number[], scope: DataScope | null) {
    if (!ids.length) return { success: 0, error: 0 };

    const qb = this.projectRepo
      .createQueryBuilder('p')
      .select('p.id', 'id')
      .where('p.id IN (:...ids)', { ids })
      .andWhere('p.deleted_at IS NULL');
    applyDataScope(qb, 'p', PROJECT_TABLE, scope);
    const rows = await qb.getRawMany<{ id: number }>();
    const deletableIds = rows.map((r) => Number(r.id));

    if (!deletableIds.length) return { success: 0, error: ids.length };
    const projects = await this.projectRepo.find({ where: { id: In(deletableIds) } });
    await this.projectRepo.softRemove(projects);
    return { success: projects.length, error: ids.length - projects.length };
  }

  // Report endpoints (Strapi parity). Entity has only user_id (creator) — both
  // user-created + user-updated filter on it since no separate updated_by col.
  async listUserCreated(userId: number, scope: DataScope | null) {
    const qb = this.projectRepo
      .createQueryBuilder('p')
      .where('p.deleted_at IS NULL')
      .andWhere('p.user_id = :uid', { uid: userId });
    applyDataScope(qb, 'p', PROJECT_TABLE, scope);
    qb.orderBy('p.created_at', 'DESC');
    return qb.getMany();
  }

  async listUserUpdated(userId: number, scope: DataScope | null) {
    const qb = this.projectRepo
      .createQueryBuilder('p')
      .where('p.deleted_at IS NULL')
      .andWhere('p.user_id = :uid', { uid: userId });
    applyDataScope(qb, 'p', PROJECT_TABLE, scope);
    qb.orderBy('p.updated_at', 'DESC');
    return qb.getMany();
  }

  // Existence check passed before calling; verify scope membership.
  private async assertInScope(id: number, scope: DataScope | null): Promise<void> {
    if (scope === null) return; // admin path
    const qb = this.projectRepo
      .createQueryBuilder('p')
      .select('1', 'one')
      .where('p.id = :id', { id });
    applyDataScope(qb, 'p', PROJECT_TABLE, scope);
    const ok = await qb.getRawOne();
    if (!ok) throw new ForbiddenException('No permission');
  }
}
