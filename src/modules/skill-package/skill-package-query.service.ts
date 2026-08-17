import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { SkillPackage, SkillPackageStatus } from '@modules/databases/skill-package.entity';
import { SkillVersion, SkillVersionState } from '@modules/databases/skill-version.entity';
import { ListSkillQueryDto } from './dto/list-skill-query.dto';
import { ListVersionsDto } from './dto/list-versions.dto';
import { ReviewQueryDto, ReviewScope } from './dto/review-query.dto';
import { PermissionQueryService } from '@common/authorization/services/permission-query.service';
import { formatVersion } from './skill-response.helper';
import { SkillVersionFileKind } from '@modules/databases/skill-version-file.entity';

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
    const rows = (await this.versionRepo.manager.query('SELECT id, email FROM users WHERE id = ANY($1)', [
      unique,
    ])) as Array<{ id: number; email: string }>;
    return new Map(rows.map((r) => [Number(r.id), r.email]));
  }

  // Dashboard counters for the whole Skill workspace. Each live package contributes exactly once
  // to the lifecycle counters via its greatest live version id. Published is intentionally separate:
  // a package may remain published while a newer update is pending or rejected.
  async stats() {
    const rows = (await this.versionRepo.manager.query(`
      WITH latest AS (
        SELECT DISTINCT ON (v.skill_package_id) v.state
        FROM skill_versions v
        INNER JOIN skill_packages p ON p.id = v.skill_package_id
        WHERE v.deleted_at IS NULL AND v.is_deleted = false
          AND p.deleted_at IS NULL AND p.is_deleted = false
        ORDER BY v.skill_package_id, v.id DESC
      )
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE state = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE state = 'approved')::int AS approved,
        COUNT(*) FILTER (WHERE state = 'rejected')::int AS rejected,
        (
          SELECT COUNT(*)::int
          FROM skill_packages p
          INNER JOIN skill_versions av
            ON av.id = p.active_version_id
           AND av.skill_package_id = p.id
           AND av.state = 'approved'
           AND av.deleted_at IS NULL
           AND av.is_deleted = false
          WHERE p.status = 'active'
            AND p.active_version_id IS NOT NULL
            AND p.deleted_at IS NULL
            AND p.is_deleted = false
        ) AS published
      FROM latest
    `)) as Array<Record<'total' | 'pending' | 'approved' | 'rejected' | 'published', number | string>>;
    const row = rows[0];
    return {
      data: {
        total: Number(row?.total ?? 0),
        pending: Number(row?.pending ?? 0),
        approved: Number(row?.approved ?? 0),
        rejected: Number(row?.rejected ?? 0),
        published: Number(row?.published ?? 0),
      },
    };
  }

  // List active packages, joining the active version's fields.
  // Sort: id DESC (deterministic — prevents page drift). Limit capped at 100 via DTO (M2).
  // Filters are always parameter-bound (never string-interpolated into SQL).
  async list(query: ListSkillQueryDto, userId: number) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100); // double-cap even if DTO max bypassed

    // Status gate: inactive packages are approver-only (mirrors the detail() inactive guard).
    // An omitted status, or any non-approver, is scoped to active; only an approver explicitly
    // asking for inactive flips the filter. The list therefore never leaks inactive packages to
    // ordinary callers even though the route carries no owner scope.
    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('skill_approve');
    const statusFilter =
      query.status === SkillPackageStatus.INACTIVE && canApprove
        ? SkillPackageStatus.INACTIVE
        : SkillPackageStatus.ACTIVE;

    const qb = this.packageRepo
      .createQueryBuilder('pkg')
      .innerJoinAndSelect('pkg.active_version', 'av', 'av.deleted_at IS NULL AND av.is_deleted = false')
      // Zip file(s) live in skill_version_files; join the non-deleted rows so each active_version
      // carries its files[] with full metadata (name/size/mime). avatar_url is a native column on
      // the version (returned automatically). Filter both soft-delete markers uniformly.
      .leftJoinAndSelect('av.files', 'avf', 'avf.deleted_at IS NULL AND avf.is_deleted = false')
      .where('pkg.deleted_at IS NULL')
      .andWhere('pkg.status = :status', { status: statusFilter })
      .andWhere('pkg.active_version_id IS NOT NULL');

    // Keyword filter: ILIKE against version name, short_description, and the tags array
    // (parameter-bound). Tags are a jsonb string array; casting to text lets the keyword
    // substring-match a tag as plain text (e.g. "happ" matches tag "happy"). A scalar cast is
    // used instead of a jsonb_array_elements_text subquery because this query paginates with
    // skip/take + joins — TypeORM rewrites that into a DISTINCT subquery and a correlated
    // subquery in the WHERE breaks the generated SQL.
    if (query.search?.trim()) {
      const kw = `%${query.search.trim()}%`;
      qb.andWhere(
        `(LOWER(av.name) ILIKE :search
          OR LOWER(av.short_description) ILIKE :search
          OR av.tags::text ILIKE :search)`,
        { search: kw.toLowerCase() },
      );
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
      .andWhere('pkg.status = :status', { status: statusFilter })
      .andWhere('pkg.active_version_id IS NOT NULL')
      .select('COUNT(pkg.id)', 'count');

    if (query.search?.trim()) {
      const kw = `%${query.search.trim()}%`;
      countQb.andWhere(
        `(LOWER(av.name) ILIKE :search
          OR LOWER(av.short_description) ILIKE :search
          OR av.tags::text ILIKE :search)`,
        { search: kw.toLowerCase() },
      );
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

    // History is APPROVED-only for every role (the timeline shows the published lineage). Order by
    // id DESC — recency by surrogate id, a locked label-agnostic decision (see method doc).
    const versions = await this.versionRepo.find({
      where: { skill_package_id: packageId, is_deleted: false, state: SkillVersionState.APPROVED },
      order: { id: 'DESC' },
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
    // hasPendingVersion MUST be sourced from a separate query — the versions[] above is approved-only
    // now, so deriving it from that array would always report false and never disable the Edit button.
    const hasPendingVersion =
      (await this.versionRepo.count({
        where: { skill_package_id: packageId, is_deleted: false, state: SkillVersionState.PENDING },
      })) > 0;

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
    if (query.skill_package_id?.length) {
      params.push(query.skill_package_id);
      where.push(`p.id = ANY($${params.length})`);
    }
    const whereSql = where.join(' AND ');

    // Filter-options mode: one distinct (id, code, name) row per accessible package, newest name wins.
    if (query.codesOnly) {
      const rows = (await this.versionRepo.manager.query(
        `SELECT DISTINCT ON (p.code) p.id AS package_id, p.code, v.name AS package_name
         FROM skill_versions v
         INNER JOIN skill_packages p ON p.id = v.skill_package_id
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
       FROM skill_versions v
       INNER JOIN skill_packages p ON p.id = v.skill_package_id
       WHERE ${whereSql}${stateSql}`,
      rowParams,
    )) as Array<{ total: number }>;
    const total = Number(countRows[0]?.total ?? 0);

    const limitIdx = rowParams.push(pageSize);
    const offsetIdx = rowParams.push((page - 1) * pageSize);
    const rows = (await this.versionRepo.manager.query(
      `SELECT p.id AS package_id, p.code, v.id AS version_id, v.name AS package_name,
              v.old_version, v.version_no, v.state, v.submitted_by, v.created_at
       FROM skill_versions v
       INNER JOIN skill_packages p ON p.id = v.skill_package_id
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
      state: SkillVersionState;
      submitted_by: number;
      created_at: Date | string;
    }>;

    const emailMap = await this.resolveEmails(rows.map((r) => r.submitted_by));
    const data = rows.map((r) => ({
      package_id: Number(r.package_id),
      code: r.code,
      package_name: r.package_name,
      version_id: Number(r.version_id),
      old_version: r.old_version == null ? null : Number(r.old_version),
      version_no: Number(r.version_no),
      state: r.state,
      submitted_by_email: emailMap.get(Number(r.submitted_by)) ?? null,
      created_at: r.created_at,
      // "mới" badge signal: first-ever pending (never had an approved predecessor).
      is_first_pending: r.state === SkillVersionState.PENDING && r.old_version == null,
    }));

    return { data, meta: { total, page, limit: pageSize } };
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

  // Version detail for both the review and "My Version" screens. Access deliberately mirrors the
  // union of those entry points: submitter, package creator, or approver. A pending version compares
  // against its immutable approved predecessor (old_version), never the package's current active
  // version, so historical review remains stable after later versions are published.
  async versionDetail(versionId: number, userId: number) {
    const version = await this.versionRepo.findOne({
      where: { id: versionId, is_deleted: false, deleted_at: IsNull() },
      relations: ['files'],
    });
    if (!version) throw new NotFoundException('Skill version not found');

    const pkg = await this.packageRepo.findOne({
      where: { id: version.skill_package_id, is_deleted: false, deleted_at: IsNull() },
    });
    if (!pkg) throw new NotFoundException('Skill package not found');

    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('skill_approve');
    const canAccess = version.submitted_by === userId || pkg.created_by === userId || canApprove;
    if (!canAccess) throw new ForbiddenException('You do not have access to this skill version');

    let comparison: {
      base_version_id: number | null;
      base_version_no: number | null;
      base: string | null;
      incoming: string;
    } | null = null;

    if (version.state === SkillVersionState.PENDING) {
      let predecessor: SkillVersion | null = null;
      if (version.old_version != null) {
        predecessor = await this.versionRepo.findOne({
          where: {
            skill_package_id: version.skill_package_id,
            version_no: version.old_version,
            state: SkillVersionState.APPROVED,
            is_deleted: false,
            deleted_at: IsNull(),
          },
        });
        if (!predecessor) {
          throw new ConflictException('Approved predecessor for this skill version was not found');
        }
      }
      comparison = {
        base_version_id: predecessor?.id ?? null,
        base_version_no: predecessor?.version_no ?? null,
        base: predecessor?.skill_md_content ?? null,
        incoming: version.skill_md_content,
      };
    }

    const emailMap = await this.resolveEmails([version.submitted_by, version.reviewed_by].filter(Boolean));
    if (version.files) version.files = version.files.filter((file) => !file.is_deleted);

    const formattedVersion = formatVersion(version);
    return {
      package: {
        id: pkg.id,
        code: pkg.code,
        status: pkg.status,
        active_version_id: pkg.active_version_id,
        created_by: pkg.created_by,
      },
      version: formattedVersion
        ? {
            ...formattedVersion,
            submitted_by_email: emailMap.get(version.submitted_by) ?? null,
            reviewed_by_email: version.reviewed_by ? emailMap.get(version.reviewed_by) ?? null : null,
          }
        : formattedVersion,
      comparison,
      can_review: version.state === SkillVersionState.PENDING && canApprove,
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
        // Stable public code of the item (skill_<id>). Additive: lets the review UI show the same
        // identifier as detail()/list without a second fetch. Null-safe if the package row is missing.
        code: pkg?.code ?? null,
        // Predecessor approved number this version builds on (NULL = first-ever). Additive: lets the
        // review UI render "mới" vs "v{old_version} chờ duyệt" instead of a bare placeholder number.
        old_version: version.old_version ?? null,
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

  // Resolve the downloadable zip descriptor for a package's ACTIVE version. Enforces the same
  // visibility rule as detail(): an inactive package is downloadable only by its owner or an
  // approver. Throws 404 when the package is missing/deleted, has no active version, or that
  // version carries no (non-deleted) zip file row.
  async resolveActiveZip(
    packageId: number,
    userId: number,
  ): Promise<{ fileUrl: string; name: string; versionNo: number }> {
    const pkg = await this.packageRepo.findOne({
      where: { id: packageId, is_deleted: false },
      relations: ['active_version', 'active_version.files'],
    });
    if (!pkg) throw new NotFoundException('Skill package not found');

    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('skill_approve');
    const isOwner = pkg.created_by === userId;
    if (pkg.status === SkillPackageStatus.INACTIVE && !isOwner && !canApprove) {
      throw new NotFoundException('Skill package not found or inactive');
    }

    const active = pkg.active_version;
    // The relations load auto-filters deleted_at but NOT the paired is_deleted boolean; treat a
    // soft-deleted active version as absent so withdrawn content is never downloadable.
    if (!pkg.active_version_id || !active || active.is_deleted) {
      throw new NotFoundException('Skill package has no active version');
    }

    // The relations load applies TypeORM's deleted_at auto-filter but not the paired is_deleted
    // boolean; exclude those rows in-memory (same pattern as detail()).
    const zip = (active.files ?? []).find((f) => !f.is_deleted && f.file_kind === SkillVersionFileKind.ZIP);
    if (!zip) throw new NotFoundException('Active skill version has no downloadable file');

    return { fileUrl: zip.file_url, name: active.name, versionNo: active.version_no };
  }
}
