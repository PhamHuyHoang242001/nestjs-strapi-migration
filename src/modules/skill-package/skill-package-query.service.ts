import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SkillPackage, SkillPackageStatus } from '@modules/databases/skill-package.entity';
import { SkillVersion, SkillVersionState } from '@modules/databases/skill-version.entity';
import { ListSkillQueryDto } from './dto/list-skill-query.dto';
import { MyItemsQueryDto } from './dto/my-items-query.dto';
import { ReviewQueryDto, ReviewScope } from './dto/review-query.dto';
import { PermissionQueryService } from '@common/authorization/services/permission-query.service';
import { formatVersion, toVersionFile, SkillFileResponse } from './skill-response.helper';
import { SkillVersionFile } from '@modules/databases/skill-version-file.entity';

// Shape of a raw skill_versions row returned by manager.query() for representative resolution.
// Only the columns the my-items summary reads are typed; skill_md_content / reject_reason are
// intentionally not surfaced downstream.
interface RawVersionRow {
  id: number | string;
  skill_package_id: number | string;
  version_no: number | string;
  state: SkillVersionState;
  name: string;
  short_description: string;
  category: string;
  tags: string[] | null;
  avatar_url: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

@Injectable()
export class SkillPackageQueryService {
  constructor(
    @InjectRepository(SkillPackage)
    private readonly packageRepo: Repository<SkillPackage>,
    @InjectRepository(SkillVersion)
    private readonly versionRepo: Repository<SkillVersion>,
    private readonly permissionQuery: PermissionQueryService,
  ) {}

  // Resolve a set of user ids → email for person-display fields (e.g. "Người đăng"). One batched
  // query, deduped, null-safe. Returns a Map(id → email); ids with no user row are simply absent.
  private async resolveEmails(ids: Array<number | null | undefined>): Promise<Map<number, string>> {
    const unique = Array.from(new Set(ids.filter((x): x is number => typeof x === 'number')));
    if (!unique.length) return new Map();
    const rows = (await this.versionRepo.manager.query(
      'SELECT id, email FROM users WHERE id = ANY($1)',
      [unique],
    )) as Array<{ id: number; email: string }>;
    return new Map(rows.map((r) => [Number(r.id), r.email]));
  }

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
  // Versions ordered by id DESC (insertion order = recency) so the newest submitted version is
  // first. Recency is deliberately derived from the surrogate id, NOT from version_no: version_no
  // is a display label whose definition may later change to a non-numeric scheme (e.g. "1.0.1"),
  // under which a version_no sort would be lexicographic and wrong. Caller-scoped: computes
  // edit/pending flags, gates inactive access to owner/approver, and scrubs non-approved draft
  // content from callers who are neither the owner nor an approver.
  async detail(packageId: number, userId: number) {
    const pkg = await this.packageRepo.findOne({
      where: { id: packageId, is_deleted: false },
      relations: ['active_version', 'active_version.files'],
    });
    if (!pkg) throw new NotFoundException('Skill package not found');

    // Resolve caller permissions once (per-user TTL cache upstream).
    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('skill_approve');
    const canUpload = codes.includes('skill_upload');
    const isOwner = pkg.created_by === userId;

    // Inactive packages are visible only to the owner or an approver; everyone else gets 404
    // (no anonymous callers — BearerGuard blocks them before the handler).
    if (pkg.status === SkillPackageStatus.INACTIVE && !isOwner && !canApprove) {
      throw new NotFoundException('Skill package not found or inactive');
    }

    const versions = await this.versionRepo.find({
      where: { skill_package_id: packageId, is_deleted: false },
      order: { id: 'DESC' }, // recency by surrogate id, label-agnostic (see method doc)
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

    // Edit gate: approver may edit any package; an uploader may edit only their own.
    const isUpdate = canApprove || (canUpload && isOwner);
    const hasPendingVersion = versions.some((v) => v.state === SkillVersionState.PENDING);

    // Content scrubbing: a caller who is neither owner nor approver must not read the draft
    // skill.md / reject reason of non-approved (pending/rejected) versions. The approved
    // active_version content stays visible to all. Mirrors the per-version gate in getDiff().
    const canSeeAllContent = isOwner || canApprove;
    const scrub = (v: SkillVersion): SkillVersion => {
      if (canSeeAllContent || v.state === SkillVersionState.APPROVED) return v;
      // Hide the author's unapproved draft artefacts (skill.md body, reject reason, release note)
      // from callers who are neither the owner nor an approver.
      return { ...v, skill_md_content: '', reject_reason: null, changelog_note: null } as SkillVersion;
    };

    // Resolve submitter ids → email so the client shows "Người đăng" as an email, not a raw id.
    const emailMap = await this.resolveEmails([
      pkg.active_version?.submitted_by,
      ...versions.map((v) => v.submitted_by),
    ]);
    const addSubmitterEmail = <T extends { submitted_by: number }>(fv: T | null | undefined) =>
      fv
        ? ({ ...fv, submitted_by_email: emailMap.get(fv.submitted_by) ?? null } as T & {
            submitted_by_email: string | null;
          })
        : fv;

    // Fold files[] → single `file` object on the active_version and every history version
    // (diagnostic-parity); avatar_url stays an inline URL column. submitted_by_email is additive
    // (numeric submitted_by kept for any id-based client logic).
    return {
      ...pkg,
      active_version: addSubmitterEmail(formatVersion(pkg.active_version)),
      versions: versions.map((v) => addSubmitterEmail(formatVersion(scrub(v)))),
      isUpdate,
      hasPendingVersion,
    };
  }

  // My Skill: the caller's own packages (created_by), ALL statuses, each with a representative
  // version (active_version if set, else the latest by version_no) folded to a thin summary.
  // The representative content columns (skill_md_content / reject_reason) are intentionally omitted
  // from the summary — the grid needs only badge + identity, and shipping full markdown per row would
  // bloat the payload / risk bulk-content exposure.
  async listMyItems(query: MyItemsQueryDto, userId: number) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const HARD_CAP = 500;

    // 1. Owned package rows (id DESC), capped defensively. Owner-scoped N is small.
    const pkgs = await this.packageRepo.find({
      where: { created_by: userId, is_deleted: false },
      order: { id: 'DESC' },
      take: HARD_CAP,
      select: ['id', 'status', 'active_version_id', 'created_by'],
    });
    if (pkgs.length === HARD_CAP) {
      // Surface truncation rather than silently dropping owned packages.
      // eslint-disable-next-line no-console
      console.warn(`listMyItems: user ${userId} hit HARD_CAP=${HARD_CAP}; results may be truncated`);
    }
    if (!pkgs.length) return { data: [], meta: { total: 0, page, limit } };

    // 2. Resolve representative version per package (≤2 queries, no N+1).
    const activeVersionIds = pkgs.map((p) => p.active_version_id).filter((id): id is number => id != null);
    const nullActivePkgIds = pkgs.filter((p) => p.active_version_id == null).map((p) => p.id);

    const repByPkgId = new Map<number, RawVersionRow>();
    if (activeVersionIds.length) {
      const activeRows = (await this.versionRepo.manager.query(
        `SELECT * FROM skill_versions WHERE id = ANY($1) AND is_deleted = false`,
        [activeVersionIds],
      )) as RawVersionRow[];
      const byId = new Map(activeRows.map((r) => [Number(r.id), r]));
      for (const p of pkgs) {
        if (p.active_version_id != null) {
          const row = byId.get(p.active_version_id);
          if (row) repByPkgId.set(p.id, row);
        }
      }
    }
    if (nullActivePkgIds.length) {
      // "Latest submitted" per package = highest id (insertion order), NOT highest version_no:
      // version_no is a display label that may later be non-numeric (e.g. "1.0.1"), so ordering
      // recency on it would be lexicographic and wrong. id is a monotonic surrogate — always safe.
      const latestRows = (await this.versionRepo.manager.query(
        `SELECT DISTINCT ON (skill_package_id) * FROM skill_versions
         WHERE skill_package_id = ANY($1) AND is_deleted = false
         ORDER BY skill_package_id, id DESC`,
        [nullActivePkgIds],
      )) as RawVersionRow[];
      for (const row of latestRows) repByPkgId.set(Number(row.skill_package_id), row);
    }

    // 3. Batch-load zip files for the chosen representatives (MANDATORY — DISTINCT ON rows carry no
    //    files relation, so without this the representative folds to file:null). Soft-delete filtered.
    const repIds = Array.from(repByPkgId.values()).map((r) => Number(r.id));
    const filesByVersionId = new Map<number, SkillVersionFile[]>();
    if (repIds.length) {
      const fileRows = (await this.versionRepo.manager.query(
        `SELECT * FROM skill_version_files
         WHERE skill_version_id = ANY($1) AND deleted_at IS NULL AND is_deleted = false`,
        [repIds],
      )) as Array<SkillVersionFile & { skill_version_id: number }>;
      for (const f of fileRows) {
        const vid = Number(f.skill_version_id);
        const list = filesByVersionId.get(vid) ?? [];
        list.push(f);
        filesByVersionId.set(vid, list);
      }
    }

    // 4. Filter (in-memory on representative — its name/category live on skill_versions), then paginate.
    const kw = query.search?.trim().toLowerCase();
    const cat = query.category?.trim().toLowerCase();
    const rowsWithRep = pkgs
      .map((p) => ({ pkg: p, rep: repByPkgId.get(p.id) }))
      .filter((x): x is { pkg: typeof x.pkg; rep: RawVersionRow } => !!x.rep)
      .filter((x) => {
        if (kw && !(`${x.rep.name ?? ''}`.toLowerCase().includes(kw) || `${x.rep.short_description ?? ''}`.toLowerCase().includes(kw))) {
          return false;
        }
        if (cat && `${x.rep.category ?? ''}`.toLowerCase() !== cat) return false;
        return true;
      });

    const total = rowsWithRep.length;
    const paged = rowsWithRep.slice((page - 1) * limit, (page - 1) * limit + limit);

    const data = paged.map(({ pkg, rep }) => {
      const file: SkillFileResponse | null = toVersionFile(filesByVersionId.get(Number(rep.id)));
      return {
        id: pkg.id,
        status: pkg.status,
        active_version_id: pkg.active_version_id,
        created_by: pkg.created_by,
        // Thin projection — omit skill_md_content / reject_reason.
        version: {
          id: Number(rep.id),
          version_no: Number(rep.version_no),
          state: rep.state,
          name: rep.name,
          short_description: rep.short_description,
          category: rep.category,
          tags: rep.tags ?? [],
          avatar_url: rep.avatar_url ?? null,
          file,
          created_at: rep.created_at,
          updated_at: rep.updated_at,
        },
        latest_state: rep.state,
      };
    });

    return { data, meta: { total, page, limit } };
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

    // Resolve submitter ids → email so the review queue lists "Người tạo" as email, not a raw id.
    const emailMap = await this.resolveEmails(data.map((v) => v.submitted_by));

    // Fold each pending version's files[] → single `file` object (diagnostic-parity), then attach
    // the submitter email (additive; numeric submitted_by kept for the client-side creator filter).
    return {
      data: data.map((v) => ({ ...formatVersion(v), submitted_by_email: emailMap.get(v.submitted_by) ?? null })),
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

    // Resolve the submitter email so the review screen shows "Submitted by" as email, not a raw id.
    const emailMap = await this.resolveEmails([version.submitted_by]);

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
        submitted_by_email: emailMap.get(version.submitted_by) ?? null,
        submitted_at: version.created_at,
      },
    };
  }
}
