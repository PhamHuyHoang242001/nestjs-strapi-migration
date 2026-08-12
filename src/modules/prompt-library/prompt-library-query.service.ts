import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PromptPackage, PromptPackageStatus } from '@modules/databases/prompt-package.entity';
import { PromptVersion, PromptVersionState } from '@modules/databases/prompt-version.entity';
import { ListPromptQueryDto } from './dto/list-prompt-query.dto';
import { MyItemsQueryDto } from './dto/my-items-query.dto';
import { ReviewQueryDto, ReviewScope } from './dto/review-query.dto';
import { PermissionQueryService } from '@common/authorization/services/permission-query.service';

// Shape of a raw prompt_versions row returned by manager.query() for representative resolution.
// Only the columns the my-items summary reads are typed; prompt_content / reject_reason are
// intentionally not surfaced downstream.
interface RawVersionRow {
  id: number | string;
  prompt_package_id: number | string;
  version_no: number | string;
  state: PromptVersionState;
  name: string;
  short_description: string;
  category: string;
  tags: string[] | null;
  avatar_url: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

// my-items row = the latest version per owned package joined to its package fields, plus the
// window-function page total. `total_count` is identical on every row of a page (COUNT(*) OVER()).
interface RawMyItemRow extends RawVersionRow {
  pkg_status: PromptPackageStatus;
  active_version_id: number | null;
  created_by: number;
  total_count: number | string;
}

@Injectable()
export class PromptLibraryQueryService {
  constructor(
    @InjectRepository(PromptPackage)
    private readonly packageRepo: Repository<PromptPackage>,
    @InjectRepository(PromptVersion)
    private readonly versionRepo: Repository<PromptVersion>,
    private readonly permissionQuery: PermissionQueryService,
  ) {}

  // Resolve a set of user ids → email for person-display fields (e.g. "Người đăng"). One batched
  // query, deduped, null-safe. Returns a Map(id → email); ids with no user row are simply absent.
  private async resolveEmails(ids: Array<number | null | undefined>): Promise<Map<number, string>> {
    const unique = Array.from(new Set(ids.filter((x): x is number => typeof x === 'number')));
    if (!unique.length) return new Map();
    const rows = (await this.versionRepo.manager.query('SELECT id, email FROM users WHERE id = ANY($1)', [
      unique,
    ])) as Array<{ id: number; email: string }>;
    return new Map(rows.map((r) => [Number(r.id), r.email]));
  }

  // List active packages, joining the active version's fields.
  // Sort: id DESC (deterministic — prevents page drift). Limit capped at 100 via DTO.
  // Filters are always parameter-bound (never string-interpolated into SQL).
  async list(query: ListPromptQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100); // double-cap even if DTO max bypassed

    const qb = this.packageRepo
      .createQueryBuilder('pkg')
      .innerJoinAndSelect('pkg.active_version', 'av', 'av.deleted_at IS NULL AND av.is_deleted = false')
      .where('pkg.deleted_at IS NULL')
      .andWhere('pkg.status = :status', { status: PromptPackageStatus.ACTIVE })
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

    // Separate COUNT query for accurate total.
    const countQb = this.packageRepo
      .createQueryBuilder('pkg')
      // Match the data query's soft-delete filter exactly (both markers) so total never overcounts.
      .innerJoin('pkg.active_version', 'av', 'av.deleted_at IS NULL AND av.is_deleted = false')
      .where('pkg.deleted_at IS NULL')
      .andWhere('pkg.status = :status', { status: PromptPackageStatus.ACTIVE })
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

    // The prompt artifact is an inline column on the active_version — returned as-is (no fold).
    return {
      data,
      meta: { total: Number(countRow?.count ?? 0), page, limit },
    };
  }

  // Detail: active version + all versions history (no separate versions endpoint).
  // Versions ordered by id DESC (insertion order = recency) so the newest submitted version is
  // first. Recency is deliberately derived from the surrogate id, NOT from version_no: version_no
  // is a display label whose definition may later change to a non-numeric scheme (e.g. "1.0.1"),
  // under which a version_no sort would be lexicographic and wrong. Caller-scoped: computes
  // edit/pending flags, gates inactive access to owner/approver, and scrubs non-approved draft
  // content from callers who are neither the owner nor an approver.
  async detail(packageId: number, userId: number) {
    const pkg = await this.packageRepo.findOne({
      where: { id: packageId, is_deleted: false },
      relations: ['active_version'],
    });
    if (!pkg) throw new NotFoundException('Prompt package not found');

    // Resolve caller permissions once (per-user TTL cache upstream).
    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('prompt_approve');
    const canUpload = codes.includes('prompt_upload');
    const isOwner = pkg.created_by === userId;

    // Inactive packages are visible only to the owner or an approver; everyone else gets 404
    // (no anonymous callers — BearerGuard blocks them before the handler).
    if (pkg.status === PromptPackageStatus.INACTIVE && !isOwner && !canApprove) {
      throw new NotFoundException('Prompt package not found or inactive');
    }

    const versions = await this.versionRepo.find({
      where: { prompt_package_id: packageId, is_deleted: false },
      order: { id: 'DESC' }, // recency by surrogate id, label-agnostic (see method doc)
    });

    // Edit gate: approver may edit any package; an uploader may edit only their own.
    const isUpdate = canApprove || (canUpload && isOwner);
    const hasPendingVersion = versions.some((v) => v.state === PromptVersionState.PENDING);

    // Content scrubbing: a caller who is neither owner nor approver must not read the draft
    // prompt_content / reject reason of non-approved (pending/rejected) versions. The approved
    // active_version content stays visible to all. Mirrors the per-version gate in getDiff().
    const canSeeAllContent = isOwner || canApprove;
    const scrub = (v: PromptVersion): PromptVersion => {
      if (canSeeAllContent || v.state === PromptVersionState.APPROVED) return v;
      // Hide the author's unapproved draft artefacts (prompt body, reject reason, release note)
      // from callers who are neither the owner nor an approver.
      return { ...v, prompt_content: '', reject_reason: null, changelog_note: null } as PromptVersion;
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

    // Prompt content is an inline column — versions are returned directly (no files fold).
    // submitted_by_email is additive (numeric submitted_by kept for any id-based client logic).
    return {
      ...pkg,
      active_version: addSubmitterEmail(pkg.active_version),
      versions: versions.map((v) => addSubmitterEmail(scrub(v))),
      isUpdate,
      hasPendingVersion,
    };
  }

  // My Prompt: the caller's own packages, bucketed by the LATEST version's state (query.status,
  // mandatory). "Latest" = newest non-deleted version by id — the monotonic surrogate, NOT version_no
  // (a display label that may later be non-numeric, e.g. "1.0.1", so ordering on it would be wrong).
  // We deliberately key on the latest version's state, not active_version_id: that column tracks the
  // published/approved version and lags behind a newer pending or rejected resubmission.
  //   pending  → newest version awaiting review    approved → newest version approved
  //   rejected → newest version rejected
  // Filtering (status + optional search/category) and pagination all run in one SQL round-trip:
  // DISTINCT ON resolves the latest version per package, COUNT(*) OVER() yields the page total.
  // Content columns (prompt_content / reject_reason) are omitted — the grid needs only badge + identity.
  async listMyItems(query: MyItemsQueryDto, userId: number) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const offset = (page - 1) * limit;

    // Bind params positionally: $1=userId, $2=status, then any search/category, then limit/offset.
    // Search/category are applied against the latest-version columns (never string-interpolated).
    const params: unknown[] = [userId, query.status];
    const filters: string[] = [];
    const kw = query.search?.trim();
    if (kw) {
      params.push(`%${kw.toLowerCase()}%`);
      filters.push(`(lower(name) LIKE $${params.length} OR lower(short_description) LIKE $${params.length})`);
    }
    const cat = query.category?.trim();
    if (cat) {
      params.push(cat.toLowerCase());
      filters.push(`lower(category) = $${params.length}`);
    }
    const filterSql = filters.length ? `AND ${filters.join(' AND ')}` : '';
    const limitIdx = params.push(limit);
    const offsetIdx = params.push(offset);

    const rows = (await this.versionRepo.manager.query(
      `WITH latest AS (
         SELECT DISTINCT ON (v.prompt_package_id)
           v.id, v.prompt_package_id, v.version_no, v.state, v.name, v.short_description,
           v.category, v.tags, v.avatar_url, v.created_at, v.updated_at,
           p.status AS pkg_status, p.active_version_id, p.created_by
         FROM prompt_versions v
         INNER JOIN prompt_packages p ON p.id = v.prompt_package_id
         WHERE p.created_by = $1
           AND p.is_deleted = false AND p.deleted_at IS NULL
           AND v.is_deleted = false AND v.deleted_at IS NULL
         ORDER BY v.prompt_package_id, v.id DESC
       ),
       bucket AS (
         SELECT * FROM latest WHERE state = $2 ${filterSql}
       )
       SELECT *, COUNT(*) OVER() AS total_count
       FROM bucket
       ORDER BY id DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    )) as RawMyItemRow[];

    if (!rows.length) return { data: [], meta: { total: 0, page, limit } };
    const total = Number(rows[0].total_count);

    const data = rows.map((r) => ({
      id: Number(r.prompt_package_id),
      status: r.pkg_status,
      active_version_id: r.active_version_id,
      created_by: r.created_by,
      // Thin projection — omit prompt_content / reject_reason.
      version: {
        id: Number(r.id),
        version_no: Number(r.version_no),
        state: r.state,
        name: r.name,
        short_description: r.short_description,
        category: r.category,
        tags: r.tags ?? [],
        avatar_url: r.avatar_url ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
      },
      latest_state: r.state,
    }));

    return { data, meta: { total, page, limit } };
  }

  // Review queue: approvers see all pending; non-approvers are forced to own-submitted only.
  // scope=all from a non-approver is SILENTLY overridden — client intent is ignored.
  async listReviews(query: ReviewQueryDto, userId: number) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('prompt_approve');

    const qb = this.versionRepo
      .createQueryBuilder('pv')
      .where('pv.deleted_at IS NULL')
      .andWhere('pv.state = :state', { state: PromptVersionState.PENDING });

    // Scope enforcement: non-approver is forced to submitted_by = me regardless of scope param.
    if (!canApprove || query.scope !== ReviewScope.ALL) {
      qb.andWhere('pv.submitted_by = :userId', { userId });
    }

    qb.orderBy('pv.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const countQb = this.versionRepo
      .createQueryBuilder('pv')
      .where('pv.deleted_at IS NULL')
      .andWhere('pv.state = :state', { state: PromptVersionState.PENDING })
      .select('COUNT(pv.id)', 'count');

    if (!canApprove || query.scope !== ReviewScope.ALL) {
      countQb.andWhere('pv.submitted_by = :userId', { userId });
    }

    const [data, countRow] = await Promise.all([qb.getMany(), countQb.getRawOne<{ count: string }>()]);

    // Resolve submitter ids → email so the review queue lists "Người tạo" as email, not a raw id.
    const emailMap = await this.resolveEmails(data.map((v) => v.submitted_by));

    // Versions returned directly (no files fold); attach the submitter email (additive; numeric
    // submitted_by kept for the client-side creator filter).
    return {
      data: data.map((v) => ({ ...v, submitted_by_email: emailMap.get(v.submitted_by) ?? null })),
      meta: { total: Number(countRow?.count ?? 0), page, limit },
    };
  }

  // Diff: return base (active version prompt_content or null) and incoming (target version content).
  // Access: caller must be the submitter OR hold prompt_approve (row-ownership check).
  async getDiff(versionId: number, userId: number) {
    const version = await this.versionRepo.findOne({
      where: { id: versionId, is_deleted: false },
    });
    if (!version) throw new NotFoundException('Prompt version not found');

    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('prompt_approve');
    const isOwner = version.submitted_by === userId;

    // Only the submitter or an approver may view the diff.
    if (!canApprove && !isOwner) {
      throw new ForbiddenException('You do not have access to this version diff');
    }

    // Base: the currently active version's prompt_content (null if no active version yet).
    const pkg = await this.packageRepo.findOne({
      where: { id: version.prompt_package_id },
    });

    let baseContent: string | null = null;
    if (pkg?.active_version_id && pkg.active_version_id !== versionId) {
      const activeVersion = await this.versionRepo.findOne({
        where: { id: pkg.active_version_id, is_deleted: false },
      });
      baseContent = activeVersion?.prompt_content ?? null;
    }

    // Resolve the submitter email so the review screen shows "Submitted by" as email, not a raw id.
    const emailMap = await this.resolveEmails([version.submitted_by]);

    return {
      base: baseContent,
      incoming: version.prompt_content,
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

  // Resolve the active prompt version + author email for Markdown export. Enforces the same
  // visibility rule as detail(): an inactive package is exportable only by its owner or an
  // approver. Throws 404 when the package is missing/deleted or has no active version.
  async resolveActiveForExport(
    packageId: number,
    userId: number,
  ): Promise<{ version: PromptVersion; authorEmail: string | null }> {
    const pkg = await this.packageRepo.findOne({
      where: { id: packageId, is_deleted: false },
      relations: ['active_version'],
    });
    if (!pkg) throw new NotFoundException('Prompt package not found');

    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('prompt_approve');
    const isOwner = pkg.created_by === userId;
    if (pkg.status === PromptPackageStatus.INACTIVE && !isOwner && !canApprove) {
      throw new NotFoundException('Prompt package not found or inactive');
    }

    // The relations load auto-filters deleted_at but NOT the paired is_deleted boolean; treat a
    // soft-deleted active version as absent so withdrawn content is never exportable.
    if (!pkg.active_version_id || !pkg.active_version || pkg.active_version.is_deleted) {
      throw new NotFoundException('Prompt package has no active version');
    }

    const emailMap = await this.resolveEmails([pkg.active_version.submitted_by]);
    const authorEmail = emailMap.get(pkg.active_version.submitted_by) ?? null;
    return { version: pkg.active_version, authorEmail };
  }
}
