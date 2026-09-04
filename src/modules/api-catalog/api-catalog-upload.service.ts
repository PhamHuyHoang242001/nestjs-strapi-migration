import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { ApiPackage, ApiPackageStatus } from '@modules/databases/api-catalog-package.entity';
import { ApiVersion, ApiVersionState } from '@modules/databases/api-catalog-version.entity';
import { CreateApiPackageDto } from './dto/create-api-package.dto';
import { CreateApiVersionDto } from './dto/create-api-version.dto';
import { RejectApiVersionDto } from './dto/reject-api-version.dto';
import { ToggleStatusDto } from './dto/toggle-status.dto';
import { ApiAvatarUrlService } from './api-avatar-url.util';
import { PermissionQueryService } from '@common/authorization/services/permission-query.service';
import { CategoryService } from '@modules/category/category.service';
import { CategoryType } from '@modules/databases/category.entity';
import { AssetHubItemMetaService, packageOwningFields } from '@modules/asset-hub-catalog/asset-hub-item-meta.service';
import { isUsageGuideEmpty, sanitizeUsageGuideHtml } from '@common/utils/usage-guide-html.util';
import { specColumns, validateAndNormalizeSpec } from './api-spec.util';

// PG unique-violation error code; caught to produce 409 on duplicate-pending.
const PG_UNIQUE_VIOLATION = '23505';
const PENDING_VERSION_CONFLICT_MESSAGE =
  'A pending version already exists for this package. Approve or reject it before submitting a new one.';
const LATEST_REJECTED_ONLY_MESSAGE = 'Only the latest rejected version of this package can be edited.';

function isPgUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError && (error as QueryFailedError & { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

@Injectable()
export class ApiCatalogUploadService {
  constructor(
    @InjectRepository(ApiPackage)
    private readonly packageRepo: Repository<ApiPackage>,
    @InjectRepository(ApiVersion)
    private readonly versionRepo: Repository<ApiVersion>,
    private readonly dataSource: DataSource,
    private readonly avatarUrl: ApiAvatarUrlService,
    private readonly permissionQuery: PermissionQueryService,
    private readonly itemMeta: AssetHubItemMetaService,
    @Optional() private readonly categoryService?: CategoryService,
  ) {}

  // Sanitize the submitted guide once, before any transaction is opened. `requireContent` is on for
  // a create (a new artifact must document itself) and off for a bump, where an author revising an
  // artifact that predates the guide may legitimately leave it blank.
  private prepareUsageGuide(html: string, requireContent: boolean): string {
    const sanitized = sanitizeUsageGuideHtml(html ?? '');
    if (requireContent && isUsageGuideEmpty(sanitized)) {
      throw new BadRequestException('INVALID_USAGE_GUIDE: usage guide is required');
    }
    return sanitized;
  }

  // Upload a new API package (creates package row + v1 pending version) in one tx.
  // The prompt text is sent inline (no ZIP, no fetch). Self-approve is allowed by design —
  // governance is an organisational concern, not enforced here.
  async createNew(dto: CreateApiPackageDto, userId: number) {
    // Avatar is stored as-sent (not downloaded); still enforce the Strapi-origin SSRF guard.
    if (dto.avatar_url) this.avatarUrl.assertStrapiUrl(dto.avatar_url);
    const usageGuideHtml = this.prepareUsageGuide(dto.usage_guide_html, true);
    const spec = validateAndNormalizeSpec(dto);

    return this.dataSource.transaction(async (manager) => {
      const resolvedCategory = await this.categoryService?.validateActive(
        dto.category_id,
        CategoryType.API_CATALOG,
        manager,
      );
      // Reject unknown publisher / user / tag ids before writing anything.
      const owning = packageOwningFields(dto.publisher_id, dto.owning_unit_name, 'create');
      await this.itemMeta.assertPublisher(manager, owning.publisher_id);
      const responsibleUserIds = await this.itemMeta.assertUsers(manager, dto.responsible_user_ids);
      const tagIds = await this.itemMeta.assertTags(manager, dto.tag_ids ?? [], 'api-catalog');

      const savedPkg = await manager.save(
        ApiPackage,
        manager.create(ApiPackage, {
          status: ApiPackageStatus.ACTIVE,
          active_version_id: null,
          created_by: userId,
          ...owning,
          // Placeholder; the real code needs the generated id and is set immediately below.
          code: '',
        }),
      );

      await this.itemMeta.replaceResponsibles(manager, 'api-catalog', savedPkg.id, responsibleUserIds);

      // code = 'api_catalog_<id>' — set post-insert (id known only now) in the SAME tx.
      await manager.update(ApiPackage, savedPkg.id, { code: `api_catalog_${savedPkg.id}` });

      // First-ever version: version_no=1 (NOT NULL) and old_version=NULL (the "mới" signal).
      const savedVersion = await manager.save(
        ApiVersion,
        manager.create(ApiVersion, {
          api_catalog_package_id: savedPkg.id,
          version_no: 1,
          old_version: null,
          state: ApiVersionState.PENDING,
          name: dto.name,
          short_description: dto.short_description,
          category_id: resolvedCategory?.id ?? dto.category_id,
          usage_guide_html: usageGuideHtml,
          kind: dto.kind,
          avatar_url: dto.avatar_url ?? null,
          ...specColumns(spec),
          changelog_note: null,
          submitted_by: userId,
        }),
      );

      await this.itemMeta.replaceVersionTags(manager, 'api-catalog', savedVersion.id, tagIds);

      return { package: { id: savedPkg.id }, version: { id: savedVersion.id, version_no: 1 } };
    });
  }

  // Upload a new version of an existing package.
  // Catches PG 23505 (partial-unique pending index) and surfaces as 409.
  async createVersion(packageId: number, dto: CreateApiVersionDto, userId: number) {
    const pkg = await this.packageRepo.findOne({ where: { id: packageId, is_deleted: false } });
    if (!pkg) throw new NotFoundException('API package not found');

    // Ownership guard: PermissionGuard already guarantees api_upload; this adds only the
    // ownership delta: an approver may bump any package, an uploader only their own.
    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('api_approve');
    if (!canApprove && pkg.created_by !== userId) {
      throw new ForbiddenException('You can only update API packages you created');
    }

    // Fail fast before validating payload URLs. The partial unique index remains the concurrency
    // authority; this preflight gives existing-pending requests deterministic 409 behavior while
    // the database constraint still closes the check-then-insert race.
    const pendingVersion = await this.versionRepo.findOne({
      where: {
        api_catalog_package_id: packageId,
        state: ApiVersionState.PENDING,
        is_deleted: false,
      },
      select: { id: true },
    });
    if (pendingVersion) {
      throw new ConflictException(PENDING_VERSION_CONFLICT_MESSAGE);
    }

    if (dto.avatar_url) this.avatarUrl.assertStrapiUrl(dto.avatar_url);
    const usageGuideHtml = this.prepareUsageGuide(dto.usage_guide_html, false);
    const spec = validateAndNormalizeSpec(dto);

    try {
      return await this.dataSource.transaction(async (manager) => {
        // Serialize concurrent submits on the same package via a row lock, then derive old_version
        // from the latest APPROVED non-deleted version_no — NOT from active_version_id, which can
        // point at a soft-deleted row. The pending version shares that number as a placeholder
        // (version_no = old_version); approve later finalizes version_no = (old_version ?? 0) + 1.
        // The one-pending partial index still guards against a second pending (23505 → 409 below).
        await manager.query('SELECT id FROM api_catalog_packages WHERE id = $1 FOR UPDATE', [packageId]);

        const maxRow = await manager.query<{ max: string | null }[]>(
          `SELECT MAX(version_no) AS max FROM api_catalog_versions
           WHERE api_catalog_package_id = $1 AND state = 'approved' AND is_deleted = false AND deleted_at IS NULL`,
          [packageId],
        );
        const oldVersion = maxRow[0]?.max == null ? null : Number(maxRow[0].max);
        // version_no stays NOT NULL: fall back to 1 when nothing is approved yet (resubmit after a
        // rejected first version) — same shape as a fresh first pending (old_version NULL).
        const placeholderVersionNo = oldVersion ?? 1;

        const resolvedCategory = await this.categoryService?.validateActive(
          dto.category_id,
          CategoryType.API_CATALOG,
          manager,
        );

        // A bump is also the only edit surface, so the package-level metadata travels with it and
        // is applied in this same transaction — publisher and people in charge first, then the
        // version row, then its tags.
        const owning = packageOwningFields(dto.publisher_id, dto.owning_unit_name, 'bump');
        await this.itemMeta.assertPublisher(manager, owning.publisher_id);
        const responsibleUserIds = await this.itemMeta.assertUsers(manager, dto.responsible_user_ids);
        const tagIds = await this.itemMeta.assertTags(manager, dto.tag_ids ?? [], 'api-catalog');

        await manager.update(ApiPackage, packageId, owning);
        await this.itemMeta.replaceResponsibles(manager, 'api-catalog', packageId, responsibleUserIds);

        const version = manager.create(ApiVersion, {
          api_catalog_package_id: packageId,
          version_no: placeholderVersionNo,
          old_version: oldVersion,
          state: ApiVersionState.PENDING,
          name: dto.name,
          short_description: dto.short_description,
          category_id: resolvedCategory?.id ?? dto.category_id,
          usage_guide_html: usageGuideHtml,
          kind: dto.kind,
          avatar_url: dto.avatar_url ?? null,
          ...specColumns(spec),
          changelog_note: dto.changelog_note ?? null,
          submitted_by: userId,
        });
        const saved = await manager.save(ApiVersion, version);

        await this.itemMeta.replaceVersionTags(manager, 'api-catalog', saved.id, tagIds);

        return { version: { id: saved.id, version_no: placeholderVersionNo } };
      });
    } catch (err) {
      // Catch PG unique-violation on partial-unique pending index → 409.
      // The constraint uidx_api_catalog_versions_one_pending_per_package is
      // partial: (api_catalog_package_id) WHERE state='pending' AND is_deleted=false.
      if (isPgUniqueViolation(err)) {
        throw new ConflictException(PENDING_VERSION_CONFLICT_MESSAGE);
      }
      throw err;
    }
  }

  // Resubmit the latest rejected version in place (same body as a package bump).
  async editVersion(versionId: number, dto: CreateApiVersionDto, userId: number) {
    const version = await this.versionRepo.findOne({ where: { id: versionId, is_deleted: false } });
    if (!version) throw new NotFoundException('API version not found');

    const pkg = await this.packageRepo.findOne({
      where: { id: version.api_catalog_package_id, is_deleted: false },
    });
    if (!pkg) throw new NotFoundException('API package not found');

    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('api_approve');
    if (!canApprove && pkg.created_by !== userId) {
      throw new ForbiddenException('You can only update API packages you created');
    }

    if (version.state !== ApiVersionState.REJECTED) {
      throw new ForbiddenException(LATEST_REJECTED_ONLY_MESSAGE);
    }

    const pendingVersion = await this.versionRepo.findOne({
      where: { api_catalog_package_id: pkg.id, state: ApiVersionState.PENDING, is_deleted: false },
      select: { id: true },
    });
    if (pendingVersion) {
      throw new ConflictException(PENDING_VERSION_CONFLICT_MESSAGE);
    }

    const latestRejected = await this.versionRepo.findOne({
      where: { api_catalog_package_id: pkg.id, state: ApiVersionState.REJECTED, is_deleted: false },
      order: { id: 'DESC' },
      select: { id: true },
    });
    if (!latestRejected || latestRejected.id !== versionId) {
      throw new ForbiddenException(LATEST_REJECTED_ONLY_MESSAGE);
    }

    if (dto.avatar_url) this.avatarUrl.assertStrapiUrl(dto.avatar_url);
    const usageGuideHtml = this.prepareUsageGuide(dto.usage_guide_html, false);
    const spec = validateAndNormalizeSpec(dto);

    try {
      return await this.dataSource.transaction(async (manager) => {
        await manager.query('SELECT id FROM api_catalog_packages WHERE id = $1 FOR UPDATE', [pkg.id]);

        const pendingRows = await manager.query<{ id: number }[]>(
          `SELECT id FROM api_catalog_versions
           WHERE api_catalog_package_id = $1 AND state = 'pending' AND is_deleted = false AND deleted_at IS NULL
           LIMIT 1`,
          [pkg.id],
        );
        if (pendingRows[0]) {
          throw new ConflictException(PENDING_VERSION_CONFLICT_MESSAGE);
        }

        const latestRows = await manager.query<{ id: number }[]>(
          `SELECT id FROM api_catalog_versions
           WHERE api_catalog_package_id = $1 AND state = 'rejected' AND is_deleted = false AND deleted_at IS NULL
           ORDER BY id DESC LIMIT 1`,
          [pkg.id],
        );
        if (Number(latestRows[0]?.id) !== versionId) {
          throw new ForbiddenException(LATEST_REJECTED_ONLY_MESSAGE);
        }

        const locked = await manager.findOne(ApiVersion, {
          where: { id: versionId, is_deleted: false },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked) throw new NotFoundException('API version not found');
        if (locked.state !== ApiVersionState.REJECTED) {
          throw new ForbiddenException(LATEST_REJECTED_ONLY_MESSAGE);
        }

        const resolvedCategory = await this.categoryService?.validateActive(
          dto.category_id,
          CategoryType.API_CATALOG,
          manager,
        );
        const owning = packageOwningFields(dto.publisher_id, dto.owning_unit_name, 'bump');
        await this.itemMeta.assertPublisher(manager, owning.publisher_id);
        const responsibleUserIds = await this.itemMeta.assertUsers(manager, dto.responsible_user_ids);
        const tagIds = await this.itemMeta.assertTags(manager, dto.tag_ids ?? [], 'api-catalog');

        await manager.update(ApiPackage, pkg.id, owning);
        await this.itemMeta.replaceResponsibles(manager, 'api-catalog', pkg.id, responsibleUserIds);

        locked.name = dto.name;
        locked.short_description = dto.short_description;
        locked.category_id = resolvedCategory?.id ?? dto.category_id;
        locked.usage_guide_html = usageGuideHtml;
        locked.kind = dto.kind;
        locked.avatar_url = dto.avatar_url ?? null;
        Object.assign(locked, specColumns(spec));
        locked.changelog_note = dto.changelog_note ?? null;
        locked.submitted_by = userId;
        locked.state = ApiVersionState.PENDING;
        locked.reject_reason = null;
        locked.reviewed_by = null;
        locked.reviewed_at = null;
        await manager.save(ApiVersion, locked);

        await this.itemMeta.replaceVersionTags(manager, 'api-catalog', locked.id, tagIds);

        return { version: { id: locked.id, version_no: locked.version_no } };
      });
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        throw new ConflictException(PENDING_VERSION_CONFLICT_MESSAGE);
      }
      throw err;
    }
  }

  // Approve a pending version in a single transaction (atomicity requirement).
  // Sets version.state=approved and package.active_version_id = version.id atomically.
  async approve(versionId: number, userId: number) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        // pessimistic_write lock: a concurrent second approve blocks here, then
        // reads state=approved and 403s — preventing double-approve overwriting
        // reviewed_by/at under the "only pending can be approved" invariant.
        const version = await manager.findOne(ApiVersion, {
          where: { id: versionId, is_deleted: false },
          lock: { mode: 'pessimistic_write' },
        });
        if (!version) throw new NotFoundException('API version not found');
        if (version.state !== ApiVersionState.PENDING) {
          throw new ForbiddenException('Only pending versions can be approved');
        }

        // Finalize the gapless approved number: (predecessor approved ?? 0) + 1. old_version is
        // left untouched so the approved row records what it built on.
        version.version_no = (version.old_version ?? 0) + 1;
        version.state = ApiVersionState.APPROVED;
        version.reviewed_by = userId;
        version.reviewed_at = new Date();
        await manager.save(ApiVersion, version);

        // Promote this version to the active version; ensure package is active.
        const pkg = await manager.findOne(ApiPackage, {
          where: { id: version.api_catalog_package_id },
        });
        if (!pkg) throw new NotFoundException('API package not found');

        pkg.active_version_id = versionId;
        pkg.status = ApiPackageStatus.ACTIVE;
        await manager.save(ApiPackage, pkg);

        return { version_id: versionId, package_id: version.api_catalog_package_id };
      });
    } catch (err) {
      // The approved-only partial-unique (api_catalog_package_id, version_no) can now fire here if a
      // duplicate approved number is ever produced concurrently — surface it as a clean 409.
      if (isPgUniqueViolation(err)) {
        throw new ConflictException('This version number is already approved for this package.');
      }
      throw err;
    }
  }

  // Reject requires a non-empty reason; the DTO's @IsNotEmpty handles the 400 case.
  async reject(versionId: number, dto: RejectApiVersionDto, userId: number) {
    const version = await this.versionRepo.findOne({ where: { id: versionId, is_deleted: false } });
    if (!version) throw new NotFoundException('API version not found');
    if (version.state !== ApiVersionState.PENDING) {
      throw new ForbiddenException('Only pending versions can be rejected');
    }

    version.state = ApiVersionState.REJECTED;
    version.reviewed_by = userId;
    version.reviewed_at = new Date();
    version.reject_reason = dto.reason;
    await this.versionRepo.save(version);

    return { version_id: versionId };
  }

  // Toggle package active/inactive status. Only approvers can call this endpoint.
  async toggleStatus(packageId: number, dto: ToggleStatusDto) {
    const pkg = await this.packageRepo.findOne({ where: { id: packageId, is_deleted: false } });
    if (!pkg) throw new NotFoundException('API package not found');

    pkg.status = dto.status;
    await this.packageRepo.save(pkg);

    return { id: packageId, status: dto.status };
  }

  // Return which prompt codes the caller holds (BearerGuard-only endpoint).
  async getMyPermissions(userId: number) {
    const codes = await this.permissionQuery.getUserPermissions(userId);
    return {
      canUpload: codes.includes('api_upload'),
      canApprove: codes.includes('api_approve'),
    };
  }
}
