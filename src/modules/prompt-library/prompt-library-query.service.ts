import { ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { PromptPackage, PromptPackageStatus } from '@modules/databases/prompt-package.entity';
import { PromptVersion, PromptVersionState } from '@modules/databases/prompt-version.entity';
import { ListPromptQueryDto } from './dto/list-prompt-query.dto';
import { ListVersionsDto } from './dto/list-versions.dto';
import { ReviewQueryDto } from './dto/review-query.dto';
import { PermissionQueryService } from '@common/authorization/services/permission-query.service';
import { CategoryService } from '@modules/category/category.service';
import { CategoryType } from '@modules/databases/category.entity';
import {
  AssetHubItemMetaReadService,
  PublisherRef,
  ResponsibleUserRef,
  TagRef,
} from '@modules/asset-hub-catalog/asset-hub-item-meta-read.service';
import { stripGuide } from '@modules/asset-hub-catalog/asset-hub-response.helper';
import { applyAssetHubCatalogFilters } from '@modules/asset-hub-catalog/asset-hub-list-filters';

@Injectable()
export class PromptLibraryQueryService {
  constructor(
    @InjectRepository(PromptPackage)
    private readonly packageRepo: Repository<PromptPackage>,
    @InjectRepository(PromptVersion)
    private readonly versionRepo: Repository<PromptVersion>,
    private readonly permissionQuery: PermissionQueryService,
    private readonly metaRead: AssetHubItemMetaReadService,
    @Optional() private readonly categoryService?: CategoryService,
  ) {}

  // Attach publisher / people in charge / tags to a set of packages, using one batched query per
  // dimension for the whole page (no N+1). Returns lookup maps the callers fold into their payloads.
  private async loadPackageMeta(
    packages: Array<{ id: number; publisher_id?: number | null }>,
    versionIds: Array<number | null | undefined>,
  ): Promise<{
    publishers: Map<number, PublisherRef>;
    responsibles: Map<number, ResponsibleUserRef[]>;
    tags: Map<number, TagRef[]>;
  }> {
    const [publishers, responsibles, tags] = await Promise.all([
      this.metaRead.getPublishersByIds(packages.map((p) => p.publisher_id)),
      this.metaRead.getResponsiblesByPackageIds(
        'prompt',
        packages.map((p) => p.id),
      ),
      this.metaRead.getTagsByVersionIds('prompt', versionIds),
    ]);
    return { publishers, responsibles, tags };
  }

  private async resolveCategories(ids: Array<number | null | undefined>) {
    return this.categoryService?.resolve(ids.filter((id): id is number => typeof id === 'number')) ?? new Map();
  }

  private decorateCategory<T extends { category_id?: number | null }>(
    version: T,
    categories: Map<number, { id: number; name: string; type: CategoryType; is_active?: boolean }>,
  ) {
    const category = version.category_id == null ? undefined : categories.get(version.category_id);
    return {
      ...version,
      category: category?.name ?? null,
      category_detail: category
        ? { id: category.id, name: category.name, type: category.type, is_active: category.is_active }
        : null,
    };
  }

  // Display filters for the review queue. Caller is already an approver (controller PermissionGuard).
  private applyReviewFilters<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    query: ReviewQueryDto,
    alias: string,
  ): void {
    if (query.submitted_by) {
      qb.andWhere(`${alias}.submitted_by = :submitted_by`, { submitted_by: query.submitted_by });
    }
    if (query.category_id) {
      qb.andWhere(`${alias}.category_id = :category_id`, { category_id: query.category_id });
    }
  }

  // newest/oldest use created_at with id as a stable tie-break; name is A→Z then id ASC.
  private applyReviewSort<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    query: ReviewQueryDto,
    alias: string,
  ): void {
    if (query.sort === 'name') {
      qb.orderBy(`${alias}.name`, 'ASC').addOrderBy(`${alias}.id`, 'ASC');
      return;
    }
    const dir = query.sort === 'oldest' ? 'ASC' : 'DESC';
    qb.orderBy(`${alias}.created_at`, dir).addOrderBy(`${alias}.id`, dir);
  }

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

  // Workspace counters used to live here as stats(); they now come from GET /v1/asset-hub/stats,
  // which reports skill and prompt in one array so the dashboard makes a single request.

  // List active packages, joining the active version's fields.
  // Sort: id DESC (deterministic — prevents page drift). Limit capped at 100 via DTO.
  // Filters are always parameter-bound (never string-interpolated into SQL).
  async list(query: ListPromptQueryDto, userId: number) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100); // double-cap even if DTO max bypassed

    // Status gate: inactive packages are approver-only (mirrors the detail() inactive guard).
    // An omitted status, or any non-approver, is scoped to active; only an approver explicitly
    // asking for inactive flips the filter. The list therefore never leaks inactive packages to
    // ordinary callers even though the route carries no owner scope.
    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('prompt_approve');
    const statusFilter =
      query.status === PromptPackageStatus.INACTIVE && canApprove
        ? PromptPackageStatus.INACTIVE
        : PromptPackageStatus.ACTIVE;

    const qb = this.packageRepo
      .createQueryBuilder('pkg')
      .innerJoinAndSelect('pkg.active_version', 'av', 'av.deleted_at IS NULL AND av.is_deleted = false')
      .where('pkg.deleted_at IS NULL')
      .andWhere('COALESCE(pkg.is_deleted, false) = false')
      .andWhere('pkg.status = :status', { status: statusFilter })
      .andWhere('pkg.active_version_id IS NOT NULL');

    // Keyword + catalog filters (search includes tag name; category; publisher) — applied through
    // one helper so the data query and the count query below carry byte-identical predicates.
    applyAssetHubCatalogFilters(qb, 'prompt', query);

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
      .andWhere('COALESCE(pkg.is_deleted, false) = false')
      .andWhere('pkg.status = :status', { status: statusFilter })
      .andWhere('pkg.active_version_id IS NOT NULL')
      .select('COUNT(pkg.id)', 'count');

    applyAssetHubCatalogFilters(countQb, 'prompt', query);

    const [data, countRow] = await Promise.all([qb.getMany(), countQb.getRawOne<{ count: string }>()]);

    const categories = await this.resolveCategories(data.map((pkg) => pkg.active_version?.category_id));
    const meta = await this.loadPackageMeta(
      data,
      data.map((pkg) => pkg.active_version_id),
    );

    // The usage guide is stripped here: it can run to 200k characters, so it never rides a list.
    const shaped = data.map((pkg) => ({
      ...pkg,
      publisher: meta.publishers.get(pkg.publisher_id) ?? null,
      responsible_users: meta.responsibles.get(pkg.id) ?? [],
      owning_unit_name: pkg.owning_unit_name ?? null,
      active_version: pkg.active_version
        ? {
            ...this.decorateCategory(stripGuide(pkg.active_version), categories),
            tags: meta.tags.get(pkg.active_version.id) ?? [],
          }
        : pkg.active_version,
    }));
    // The prompt artifact is an inline column on the active_version — returned as-is (no fold).
    return {
      data: shaped,
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

    // History is APPROVED-only for every caller. Thin projection: version number + approval date.
    const versions = await this.versionRepo.find({
      where: { prompt_package_id: packageId, is_deleted: false, state: PromptVersionState.APPROVED },
      order: { id: 'DESC' },
      select: ['id', 'version_no', 'reviewed_at'],
    });

    // Edit gate: approver may edit any package; an uploader may edit only their own.
    const isUpdate = canApprove || (canUpload && isOwner);
    // hasPendingVersion MUST be sourced from a separate query — the versions[] above is approved-only
    // now, so deriving it from that array would always report false and never disable the Edit button.
    const hasPendingVersion =
      (await this.versionRepo.count({
        where: { prompt_package_id: packageId, is_deleted: false, state: PromptVersionState.PENDING },
      })) > 0;

    const emailMap = await this.resolveEmails([pkg.active_version?.submitted_by]);
    const addSubmitterEmail = <T extends { submitted_by: number }>(fv: T | null | undefined) =>
      fv
        ? ({ ...fv, submitted_by_email: emailMap.get(fv.submitted_by) ?? null } as T & {
            submitted_by_email: string | null;
          })
        : fv;

    const categories = await this.resolveCategories([pkg.active_version?.category_id]);
    const meta = await this.loadPackageMeta([pkg], [pkg.active_version_id]);
    const withTags = <T extends { id: number }>(version: T | null | undefined) =>
      version ? { ...version, tags: meta.tags.get(version.id) ?? [] } : version;

    const formattedActive = withTags(addSubmitterEmail(this.decorateCategory(pkg.active_version, categories)));
    const activeId = pkg.active_version_id ?? pkg.active_version?.id;
    return {
      ...pkg,
      publisher: meta.publishers.get(pkg.publisher_id) ?? null,
      responsible_users: meta.responsibles.get(pkg.id) ?? [],
      owning_unit_name: pkg.owning_unit_name ?? null,
      active_version: formattedActive,
      versions: versions.map((v) =>
        activeId != null && v.id === activeId
          ? formattedActive
          : { version_no: v.version_no, reviewed_at: v.reviewed_at ?? null },
      ),
      isUpdate,
      hasPendingVersion,
    };
  }

  // "My Version" list: flat 1-row-per-version across pending + approved + rejected, always scoped to
  // the caller. Every caller — INCLUDING approvers — sees only the versions they personally submitted
  // (v.submitted_by) OR that belong to a package they created (p.created_by). There is no role-based
  // "see all" here; an approver's org-wide view lives in the review queue, not this personal list.
  // Thin projection (NO content columns). codesOnly=true short-circuits to the distinct-code list for
  // the filter multi-select under the IDENTICAL visibility predicate so the options can never drift.
  async listVersions(query: ListVersionsDto, userId: number) {
    // Shared visibility WHERE + params for both the list and codesOnly modes. Own-scope is always
    // applied — the caller's role does not widen it.
    const params: unknown[] = [];
    const where: string[] = ['v.is_deleted = false', 'v.deleted_at IS NULL', 'p.is_deleted = false'];
    params.push(userId);
    where.push(`(v.submitted_by = $${params.length} OR p.created_by = $${params.length})`);
    if (query.prompt_package_id?.length) {
      params.push(query.prompt_package_id);
      where.push(`p.id = ANY($${params.length})`);
    }
    const whereSql = where.join(' AND ');

    // Filter-options mode: one distinct (id, code, name) row per accessible package, newest name wins.
    if (query.codesOnly) {
      const rows = (await this.versionRepo.manager.query(
        `SELECT DISTINCT ON (p.code) p.id AS package_id, p.code, v.name AS package_name
         FROM prompt_versions v
         INNER JOIN prompt_packages p ON p.id = v.prompt_package_id
         WHERE ${whereSql}
         ORDER BY p.code, v.id DESC`,
        params,
      )) as Array<{ package_id: number; code: string; package_name: string }>;
      return { data: rows.map((r) => ({ ...r, package_id: Number(r.package_id) })) };
    }

    // State filter is applied to the rows only (NOT to codesOnly — the select lists all accessible
    // packages regardless of the currently chosen state).
    const rowParams = [...params];
    let stateSql = '';
    if (query.state && query.state !== 'all') {
      rowParams.push(query.state);
      stateSql = ` AND v.state = $${rowParams.length}`;
    }

    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const orderDir = query.sort === 'oldest' ? 'ASC' : 'DESC';

    const countRows = (await this.versionRepo.manager.query(
      `SELECT COUNT(*)::int AS total
       FROM prompt_versions v
       INNER JOIN prompt_packages p ON p.id = v.prompt_package_id
       WHERE ${whereSql}${stateSql}`,
      rowParams,
    )) as Array<{ total: number }>;
    const total = Number(countRows[0]?.total ?? 0);

    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canUpload = codes.includes('prompt_upload');

    const limitIdx = rowParams.push(pageSize);
    const offsetIdx = rowParams.push((page - 1) * pageSize);
    const rows = (await this.versionRepo.manager.query(
      `SELECT p.id AS package_id, p.code, v.id AS version_id, v.name AS package_name,
              v.old_version, v.version_no, v.state, v.submitted_by, v.created_at, v.avatar_url,
              (
                v.state = 'rejected'
                AND v.submitted_by = $1
                AND NOT EXISTS (
                  SELECT 1 FROM prompt_versions pending
                  WHERE pending.prompt_package_id = v.prompt_package_id
                    AND pending.state = 'pending'
                    AND pending.is_deleted = false AND pending.deleted_at IS NULL
                )
                AND v.id = (
                  SELECT MAX(rejected.id) FROM prompt_versions rejected
                  WHERE rejected.prompt_package_id = v.prompt_package_id
                    AND rejected.state = 'rejected'
                    AND rejected.is_deleted = false AND rejected.deleted_at IS NULL
                )
              ) AS is_update
       FROM prompt_versions v
       INNER JOIN prompt_packages p ON p.id = v.prompt_package_id
       WHERE ${whereSql}${stateSql}
       ORDER BY v.created_at ${orderDir}, v.id ${orderDir}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      rowParams,
    )) as Array<{
      package_id: number;
      code: string;
      version_id: number;
      package_name: string;
      old_version: number | null;
      version_no: number;
      state: PromptVersionState;
      submitted_by: number;
      created_at: Date | string;
      avatar_url: string | null;
      is_update: boolean;
    }>;

    const emailMap = await this.resolveEmails(rows.map((r) => r.submitted_by));
    // This projection is raw SQL, so tags are attached explicitly — one batched query for the whole
    // page. The usage guide is deliberately absent from the SELECT above.
    const tagMap = await this.metaRead.getTagsByVersionIds(
      'prompt',
      rows.map((r) => Number(r.version_id)),
    );
    const data = rows.map((r) => ({
      package_id: Number(r.package_id),
      code: r.code,
      package_name: r.package_name,
      version_id: Number(r.version_id),
      tags: tagMap.get(Number(r.version_id)) ?? [],
      old_version: r.old_version == null ? null : Number(r.old_version),
      version_no: Number(r.version_no),
      state: r.state,
      submitted_by_email: emailMap.get(Number(r.submitted_by)) ?? null,
      created_at: r.created_at,
      avatar_url: r.avatar_url ?? null,
      // "mới" badge signal: first-ever pending (never had an approved predecessor).
      is_first_pending: r.state === PromptVersionState.PENDING && r.old_version == null,
      isUpdate: canUpload && r.is_update === true,
    }));

    return { data, meta: { total, page, limit: pageSize } };
  }

  // Review queue: approver-only (controller PermissionGuard). Optional display filters below.
  async listReviews(query: ReviewQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const qb = this.versionRepo
      .createQueryBuilder('pv')
      .where('pv.deleted_at IS NULL')
      .andWhere('COALESCE(pv.is_deleted, false) = false')
      .andWhere('pv.state = :state', { state: PromptVersionState.PENDING });

    this.applyReviewFilters(qb, query, 'pv');
    this.applyReviewSort(qb, query, 'pv');
    qb.skip((page - 1) * limit).take(limit);

    const countQb = this.versionRepo
      .createQueryBuilder('pv')
      .where('pv.deleted_at IS NULL')
      .andWhere('COALESCE(pv.is_deleted, false) = false')
      .andWhere('pv.state = :state', { state: PromptVersionState.PENDING })
      .select('COUNT(pv.id)', 'count');
    this.applyReviewFilters(countQb, query, 'pv');

    const [data, countRow] = await Promise.all([qb.getMany(), countQb.getRawOne<{ count: string }>()]);

    // Resolve submitter ids → email so the review queue lists "Người tạo" as email, not a raw id.
    const emailMap = await this.resolveEmails(data.map((v) => v.submitted_by));

    // Versions returned directly (no files fold); attach the submitter email (additive; numeric
    // submitted_by kept for the creator filter).
    const categories = await this.resolveCategories(data.map((version) => version.category_id));
    // The review queue is a list surface: it carries tags but not the usage guide. A reviewer opens
    // the version detail to read the guide.
    const tagMap = await this.metaRead.getTagsByVersionIds(
      'prompt',
      data.map((v) => v.id),
    );
    return {
      data: data.map((v) => ({
        ...this.decorateCategory(stripGuide(v), categories),
        tags: tagMap.get(v.id) ?? [],
        submitted_by_email: emailMap.get(v.submitted_by) ?? null,
      })),
      meta: { total: Number(countRow?.count ?? 0), page, limit },
    };
  }

  // Distinct submitters of pending versions — feeds the review-queue "Người tạo" filter.
  // Approver-only (controller PermissionGuard); lists every pending submitter.
  async listReviewSubmitters() {
    const rows = (await this.versionRepo.manager.query(
      `SELECT DISTINCT v.submitted_by AS id, u.email
         FROM prompt_versions v
         LEFT JOIN users u ON u.id = v.submitted_by
        WHERE v.state = 'pending'
          AND v.deleted_at IS NULL
          AND COALESCE(v.is_deleted, false) = false
        ORDER BY u.email ASC NULLS LAST, v.submitted_by ASC`,
    )) as Array<{ id: number; email: string | null }>;
    return { data: rows.map((row) => ({ id: Number(row.id), email: row.email ?? null })) };
  }

  // Full version detail shared by review and "My Version". Access is the union of those screens:
  // submitter, package creator, or approver. Pending comparison uses the stored approved predecessor
  // rather than active_version_id, keeping the result stable after later publication changes.
  async versionDetail(versionId: number, userId: number) {
    const version = await this.versionRepo.findOne({
      where: { id: versionId, is_deleted: false, deleted_at: IsNull() },
    });
    if (!version) throw new NotFoundException('Prompt version not found');

    const pkg = await this.packageRepo.findOne({
      where: { id: version.prompt_package_id, is_deleted: false, deleted_at: IsNull() },
    });
    if (!pkg) throw new NotFoundException('Prompt package not found');

    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('prompt_approve');
    const canAccess = version.submitted_by === userId || pkg.created_by === userId || canApprove;
    if (!canAccess) throw new ForbiddenException('You do not have access to this prompt version');

    let comparison: {
      base_version_id: number | null;
      base_version_no: number | null;
      base: string | null;
      incoming: string;
    } | null = null;

    if (version.state === PromptVersionState.PENDING) {
      let predecessor: PromptVersion | null = null;
      if (version.old_version != null) {
        predecessor = await this.versionRepo.findOne({
          where: {
            prompt_package_id: version.prompt_package_id,
            version_no: version.old_version,
            state: PromptVersionState.APPROVED,
            is_deleted: false,
            deleted_at: IsNull(),
          },
        });
        if (!predecessor) {
          throw new ConflictException('Approved predecessor for this prompt version was not found');
        }
      }
      comparison = {
        base_version_id: predecessor?.id ?? null,
        base_version_no: predecessor?.version_no ?? null,
        base: predecessor?.prompt_content ?? null,
        incoming: version.prompt_content,
      };
    }

    const emailMap = await this.resolveEmails([version.submitted_by, version.reviewed_by].filter(Boolean));
    const categories = await this.resolveCategories([version.category_id]);
    // Version detail carries the full usage guide: this endpoint already 403s anyone who is not the
    // submitter, the package creator, or an approver, so no extra scrub is needed here.
    const meta = await this.loadPackageMeta([pkg], [version.id]);
    return {
      package: {
        id: pkg.id,
        code: pkg.code,
        status: pkg.status,
        active_version_id: pkg.active_version_id,
        created_by: pkg.created_by,
        publisher: meta.publishers.get(pkg.publisher_id) ?? null,
        responsible_users: meta.responsibles.get(pkg.id) ?? [],
        owning_unit_name: pkg.owning_unit_name ?? null,
      },
      version: {
        ...this.decorateCategory(version, categories),
        tags: meta.tags.get(version.id) ?? [],
        submitted_by_email: emailMap.get(version.submitted_by) ?? null,
        reviewed_by_email: version.reviewed_by ? emailMap.get(version.reviewed_by) ?? null : null,
      },
      comparison,
      can_review: version.state === PromptVersionState.PENDING && canApprove,
    };
  }

  // Diff: return base (active version prompt_content or null) and incoming (target version content).
  // Controller already requires prompt_upload OR prompt_approve. This method only applies
  // row-ownership: upload-only → submitter or package creator; approver → any version.
  async getDiff(versionId: number, userId: number) {
    const version = await this.versionRepo.findOne({
      where: { id: versionId, is_deleted: false },
    });
    if (!version) throw new NotFoundException('Prompt version not found');

    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('prompt_approve');
    const pkg = await this.packageRepo.findOne({
      where: { id: version.prompt_package_id },
    });
    const canAccess = version.submitted_by === userId || pkg?.created_by === userId || canApprove;
    if (!canAccess) {
      throw new ForbiddenException('You do not have access to this version diff');
    }

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
        // Stable public code of the item (prompt_<id>). Additive: lets the review UI show the same
        // identifier as detail()/list without a second fetch. Null-safe if the package row is missing.
        code: pkg?.code ?? null,
        // Predecessor approved number this version builds on (NULL = first-ever). Additive: lets the
        // review UI render "mới" vs "v{old_version} chờ duyệt" instead of a bare placeholder number.
        old_version: version.old_version ?? null,
        state: version.state,
        name: version.name,
        avatar_url: version.avatar_url ?? null,
        category: (await this.resolveCategories([version.category_id])).get(version.category_id ?? -1)?.name ?? null,
        category_id: version.category_id,
        category_detail: (await this.resolveCategories([version.category_id])).get(version.category_id ?? -1) ?? null,
        tags: (await this.metaRead.getTagsByVersionIds('prompt', [version.id])).get(version.id) ?? [],
        // Single-version surface, and this method already 403s anyone who is not the submitter or
        // an approver — so the guide rides along and the review screen needs no second request.
        usage_guide_html: version.usage_guide_html ?? '',
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
  ): Promise<{ version: PromptVersion; authorEmail: string | null; categoryName: string | null; tags: TagRef[] }> {
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
    const categoryName =
      (await this.resolveCategories([pkg.active_version.category_id])).get(pkg.active_version.category_id ?? -1)
        ?.name ?? null;
    // Tags travel separately so the exported frontmatter can render their names.
    const tags = (await this.metaRead.getTagsByVersionIds('prompt', [pkg.active_version.id])).get(
      pkg.active_version.id,
    );
    return { version: pkg.active_version, authorEmail, categoryName, tags: tags ?? [] };
  }
}
