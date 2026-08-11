import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SkillPackage, SkillPackageStatus } from '@modules/databases/skill-package.entity';
import { SkillVersion, SkillVersionState } from '@modules/databases/skill-version.entity';
import { ListSkillQueryDto } from './dto/list-skill-query.dto';
import { ReviewQueryDto, ReviewScope } from './dto/review-query.dto';
import { PermissionQueryService } from '@common/authorization/services/permission-query.service';
import { formatVersion } from './skill-response.helper';

@Injectable()
export class SkillPackageQueryService {
  constructor(
    @InjectRepository(SkillPackage)
    private readonly packageRepo: Repository<SkillPackage>,
    @InjectRepository(SkillVersion)
    private readonly versionRepo: Repository<SkillVersion>,
    private readonly permissionQuery: PermissionQueryService,
  ) {}

  // List active packages, joining the active version's fields.
  // Sort: id DESC (deterministic — prevents page drift). Limit capped at 100 via DTO (M2).
  // Filters are always parameter-bound (never string-interpolated into SQL).
  async list(query: ListSkillQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100); // double-cap even if DTO max bypassed

    const qb = this.packageRepo
      .createQueryBuilder('pkg')
      .innerJoinAndSelect('pkg.active_version', 'av', 'av.deleted_at IS NULL AND av.is_deleted = false')
      // Zip file(s) live in skill_version_files; join the non-deleted rows so each active_version
      // carries its files[] with full metadata (name/size/mime). avatar_url is a native column on
      // the version (returned automatically). Filter both soft-delete markers uniformly.
      .leftJoinAndSelect('av.files', 'avf', 'avf.deleted_at IS NULL AND avf.is_deleted = false')
      .where('pkg.deleted_at IS NULL')
      .andWhere('pkg.status = :status', { status: SkillPackageStatus.ACTIVE })
      .andWhere('pkg.active_version_id IS NOT NULL');

    // Keyword filter: ILIKE against version name and short_description (parameter-bound).
    if (query.search?.trim()) {
      const kw = `%${query.search.trim()}%`;
      qb.andWhere('(LOWER(av.name) ILIKE :search OR LOWER(av.short_description) ILIKE :search)', {
        search: kw.toLowerCase(),
      });
    }

    if (query.category?.trim()) {
      qb.andWhere('LOWER(av.category) = :category', { category: query.category.trim().toLowerCase() });
    }

    // JSONB containment filter: @> bound as a JSON parameter (not interpolated).
    if (query.tags?.length) {
      qb.andWhere('av.tags @> :tags::jsonb', { tags: JSON.stringify(query.tags) });
    }

    // Deterministic sort prevents page drift on concurrent inserts (id DESC is stable).
    qb.orderBy('pkg.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    // Separate COUNT query for accurate total (reference: bi-payment-document.service.ts:502).
    const countQb = this.packageRepo
      .createQueryBuilder('pkg')
      .innerJoin('pkg.active_version', 'av', 'av.deleted_at IS NULL')
      .where('pkg.deleted_at IS NULL')
      .andWhere('pkg.status = :status', { status: SkillPackageStatus.ACTIVE })
      .andWhere('pkg.active_version_id IS NOT NULL')
      .select('COUNT(pkg.id)', 'count');

    if (query.search?.trim()) {
      const kw = `%${query.search.trim()}%`;
      countQb.andWhere('(LOWER(av.name) ILIKE :search OR LOWER(av.short_description) ILIKE :search)', {
        search: kw.toLowerCase(),
      });
    }
    if (query.category?.trim()) {
      countQb.andWhere('LOWER(av.category) = :category', { category: query.category.trim().toLowerCase() });
    }
    if (query.tags?.length) {
      countQb.andWhere('av.tags @> :tags::jsonb', { tags: JSON.stringify(query.tags) });
    }

    const [data, countRow] = await Promise.all([qb.getMany(), countQb.getRawOne<{ count: string }>()]);

    // Fold each active_version's files[] down to the single `file` object (diagnostic-parity);
    // avatar_url stays an inline URL column. Packages always have an active_version here (innerJoin).
    const shaped = data.map((pkg) =>
      pkg.active_version ? { ...pkg, active_version: formatVersion(pkg.active_version) } : pkg,
    );
    return {
      data: shaped,
      meta: { total: Number(countRow?.count ?? 0), page, limit },
    };
  }

  // Detail: active version + all versions history (M7 — no separate versions endpoint).
  // Versions ordered version_no DESC so the newest is first.
  async detail(packageId: number) {
    const pkg = await this.packageRepo.findOne({
      where: { id: packageId, is_deleted: false },
      relations: ['active_version', 'active_version.files'],
    });
    if (!pkg || pkg.status === SkillPackageStatus.INACTIVE) {
      throw new NotFoundException('Skill package not found or inactive');
    }

    const versions = await this.versionRepo.find({
      where: { skill_package_id: packageId, is_deleted: false },
      order: { version_no: 'DESC' },
      relations: ['files'],
    });

    // The `relations` load applies TypeORM's deleted_at auto-filter but not the paired
    // is_deleted boolean; exclude those rows in-memory so detail() matches list()'s filtering.
    const notDeleted = (f: { is_deleted?: boolean }) => !f.is_deleted;
    if (pkg.active_version?.files) {
      pkg.active_version.files = pkg.active_version.files.filter(notDeleted);
    }
    for (const v of versions) {
      if (v.files) v.files = v.files.filter(notDeleted);
    }

    // Fold files[] → single `file` object on the active_version and every history version
    // (diagnostic-parity); avatar_url stays an inline URL column.
    return {
      ...pkg,
      active_version: formatVersion(pkg.active_version),
      versions: versions.map((v) => formatVersion(v)),
    };
  }

  // Review queue: approvers see all pending; non-approvers are forced to own-submitted only.
  // C3: scope=all from a non-approver is SILENTLY overridden — client intent is ignored.
  async listReviews(query: ReviewQueryDto, userId: number) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('skill_approve');

    const qb = this.versionRepo
      .createQueryBuilder('sv')
      // Join the zip file row(s) so each pending version carries its `file` object (diagnostic-parity),
      // non-deleted only (both soft-delete markers), matching list()/detail().
      .leftJoinAndSelect('sv.files', 'svf', 'svf.deleted_at IS NULL AND svf.is_deleted = false')
      .where('sv.deleted_at IS NULL')
      .andWhere('sv.state = :state', { state: SkillVersionState.PENDING });

    // C3 enforcement: non-approver is forced to submitted_by = me regardless of scope param.
    if (!canApprove || query.scope !== ReviewScope.ALL) {
      qb.andWhere('sv.submitted_by = :userId', { userId });
    }

    qb.orderBy('sv.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const countQb = this.versionRepo
      .createQueryBuilder('sv')
      .where('sv.deleted_at IS NULL')
      .andWhere('sv.state = :state', { state: SkillVersionState.PENDING })
      .select('COUNT(sv.id)', 'count');

    if (!canApprove || query.scope !== ReviewScope.ALL) {
      countQb.andWhere('sv.submitted_by = :userId', { userId });
    }

    const [data, countRow] = await Promise.all([qb.getMany(), countQb.getRawOne<{ count: string }>()]);

    // Fold each pending version's files[] → single `file` object (diagnostic-parity).
    return {
      data: data.map((v) => formatVersion(v)),
      meta: { total: Number(countRow?.count ?? 0), page, limit },
    };
  }

  // Diff: return base (active version skill.md or null) and incoming (target version skill.md).
  // Access: caller must be the submitter OR hold skill_approve (C4 row-ownership check).
  async getDiff(versionId: number, userId: number) {
    const version = await this.versionRepo.findOne({
      where: { id: versionId, is_deleted: false },
    });
    if (!version) throw new NotFoundException('Skill version not found');

    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('skill_approve');
    const isOwner = version.submitted_by === userId;

    // C4: only the submitter or an approver may view the diff.
    if (!canApprove && !isOwner) {
      throw new ForbiddenException('You do not have access to this version diff');
    }

    // Base: the currently active version's skill.md content (null if no active version yet).
    const pkg = await this.packageRepo.findOne({
      where: { id: version.skill_package_id },
    });

    let baseContent: string | null = null;
    if (pkg?.active_version_id && pkg.active_version_id !== versionId) {
      const activeVersion = await this.versionRepo.findOne({
        where: { id: pkg.active_version_id, is_deleted: false },
      });
      baseContent = activeVersion?.skill_md_content ?? null;
    }

    return {
      base: baseContent,
      incoming: version.skill_md_content,
      metadata: {
        version_id: version.id,
        version_no: version.version_no,
        state: version.state,
        name: version.name,
        category: version.category,
        tags: version.tags,
        changelog_note: version.changelog_note,
        submitted_by: version.submitted_by,
        submitted_at: version.created_at,
      },
    };
  }
}
