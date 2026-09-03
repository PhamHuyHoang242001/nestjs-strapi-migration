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
import { PromptPackage, PromptPackageStatus } from '@modules/databases/prompt-package.entity';
import { PromptVersion, PromptVersionState } from '@modules/databases/prompt-version.entity';
import { CreatePromptPackageDto } from './dto/create-prompt-package.dto';
import { CreatePromptVersionDto } from './dto/create-prompt-version.dto';
import { RejectPromptVersionDto } from './dto/reject-prompt-version.dto';
import { ToggleStatusDto } from './dto/toggle-status.dto';
import { PromptAvatarUrlService } from './prompt-avatar-url.util';
import { PermissionQueryService } from '@common/authorization/services/permission-query.service';
import { CategoryService } from '@modules/category/category.service';
import { CategoryType } from '@modules/databases/category.entity';
import { AssetHubItemMetaService, packageOwningFields } from '@modules/asset-hub-catalog/asset-hub-item-meta.service';
import { isUsageGuideEmpty, sanitizeUsageGuideHtml } from '@common/utils/usage-guide-html.util';

// PG unique-violation error code; caught to produce 409 on duplicate-pending.
const PG_UNIQUE_VIOLATION = '23505';
const PENDING_VERSION_CONFLICT_MESSAGE =
  'A pending version already exists for this package. Approve or reject it before submitting a new one.';

function isPgUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError && (error as QueryFailedError & { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

@Injectable()
export class PromptLibraryUploadService {
  constructor(
    @InjectRepository(PromptPackage)
    private readonly packageRepo: Repository<PromptPackage>,
    @InjectRepository(PromptVersion)
    private readonly versionRepo: Repository<PromptVersion>,
    private readonly dataSource: DataSource,
    private readonly avatarUrl: PromptAvatarUrlService,
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

  // Upload a new prompt package (creates package row + v1 pending version) in one tx.
  // The prompt text is sent inline (no ZIP, no fetch). Self-approve is allowed by design —
  // governance is an organisational concern, not enforced here.
  async createNew(dto: CreatePromptPackageDto, userId: number) {
    // Avatar is stored as-sent (not downloaded); still enforce the Strapi-origin SSRF guard.
    if (dto.avatar_url) this.avatarUrl.assertStrapiUrl(dto.avatar_url);
    const usageGuideHtml = this.prepareUsageGuide(dto.usage_guide_html, true);

    return this.dataSource.transaction(async (manager) => {
      const resolvedCategory = await this.categoryService?.validateActive(
        dto.category_id,
        CategoryType.PROMPT,
        manager,
      );
      // Reject unknown publisher / user / tag ids before writing anything.
      const owning = packageOwningFields(dto.publisher_id, dto.owning_unit_name, 'create');
      await this.itemMeta.assertPublisher(manager, owning.publisher_id);
      const responsibleUserIds = await this.itemMeta.assertUsers(manager, dto.responsible_user_ids);
      const tagIds = await this.itemMeta.assertTags(manager, dto.tag_ids ?? [], 'prompt');

      const savedPkg = await manager.save(
        PromptPackage,
        manager.create(PromptPackage, {
          status: PromptPackageStatus.ACTIVE,
          active_version_id: null,
          created_by: userId,
          ...owning,
          // Placeholder; the real code needs the generated id and is set immediately below.
          code: '',
        }),
      );

      await this.itemMeta.replaceResponsibles(manager, 'prompt', savedPkg.id, responsibleUserIds);

      // code = 'prompt_<id>' — set post-insert (id known only now) in the SAME tx.
      await manager.update(PromptPackage, savedPkg.id, { code: `prompt_${savedPkg.id}` });

      // First-ever version: version_no=1 (NOT NULL) and old_version=NULL (the "mới" signal).
      const savedVersion = await manager.save(
        PromptVersion,
        manager.create(PromptVersion, {
          prompt_package_id: savedPkg.id,
          version_no: 1,
          old_version: null,
          state: PromptVersionState.PENDING,
          name: dto.name,
          short_description: dto.short_description,
          category_id: resolvedCategory?.id ?? dto.category_id,
          usage_guide_html: usageGuideHtml,
          kind: dto.kind,
          avatar_url: dto.avatar_url ?? null,
          prompt_content: dto.prompt_content,
          changelog_note: null,
          submitted_by: userId,
        }),
      );

      await this.itemMeta.replaceVersionTags(manager, 'prompt', savedVersion.id, tagIds);

      return { package: { id: savedPkg.id }, version: { id: savedVersion.id, version_no: 1 } };
    });
  }

  // Upload a new version of an existing package.
  // Catches PG 23505 (partial-unique pending index) and surfaces as 409.
  async createVersion(packageId: number, dto: CreatePromptVersionDto, userId: number) {
    const pkg = await this.packageRepo.findOne({ where: { id: packageId, is_deleted: false } });
    if (!pkg) throw new NotFoundException('Prompt package not found');

    // Ownership guard: PermissionGuard already guarantees prompt_upload; this adds only the
    // ownership delta: an approver may bump any package, an uploader only their own.
    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('prompt_approve');
    if (!canApprove && pkg.created_by !== userId) {
      throw new ForbiddenException('You can only update prompt packages you created');
    }

    // Fail fast before validating payload URLs. The partial unique index remains the concurrency
    // authority; this preflight gives existing-pending requests deterministic 409 behavior while
    // the database constraint still closes the check-then-insert race.
    const pendingVersion = await this.versionRepo.findOne({
      where: {
        prompt_package_id: packageId,
        state: PromptVersionState.PENDING,
        is_deleted: false,
      },
      select: { id: true },
    });
    if (pendingVersion) {
      throw new ConflictException(PENDING_VERSION_CONFLICT_MESSAGE);
    }

    if (dto.avatar_url) this.avatarUrl.assertStrapiUrl(dto.avatar_url);
    // A bump may leave the guide blank — artifacts created before guides existed keep working.
    const usageGuideHtml = this.prepareUsageGuide(dto.usage_guide_html, false);

    try {
      return await this.dataSource.transaction(async (manager) => {
        // Serialize concurrent submits on the same package via a row lock, then derive old_version
        // from the latest APPROVED non-deleted version_no — NOT from active_version_id, which can
        // point at a soft-deleted row. The pending version shares that number as a placeholder
        // (version_no = old_version); approve later finalizes version_no = (old_version ?? 0) + 1.
        // The one-pending partial index still guards against a second pending (23505 → 409 below).
        await manager.query('SELECT id FROM prompt_packages WHERE id = $1 FOR UPDATE', [packageId]);

        const maxRow = await manager.query<{ max: string | null }[]>(
          `SELECT MAX(version_no) AS max FROM prompt_versions
           WHERE prompt_package_id = $1 AND state = 'approved' AND is_deleted = false AND deleted_at IS NULL`,
          [packageId],
        );
        const oldVersion = maxRow[0]?.max == null ? null : Number(maxRow[0].max);
        // version_no stays NOT NULL: fall back to 1 when nothing is approved yet (resubmit after a
        // rejected first version) — same shape as a fresh first pending (old_version NULL).
        const placeholderVersionNo = oldVersion ?? 1;

        const resolvedCategory = await this.categoryService?.validateActive(
          dto.category_id,
          CategoryType.PROMPT,
          manager,
        );

        // A bump is also the only edit surface, so the package-level metadata travels with it and
        // is applied in this same transaction — publisher and people in charge first, then the
        // version row, then its tags.
        const owning = packageOwningFields(dto.publisher_id, dto.owning_unit_name, 'bump');
        await this.itemMeta.assertPublisher(manager, owning.publisher_id);
        const responsibleUserIds = await this.itemMeta.assertUsers(manager, dto.responsible_user_ids);
        const tagIds = await this.itemMeta.assertTags(manager, dto.tag_ids ?? [], 'prompt');

        await manager.update(PromptPackage, packageId, owning);
        await this.itemMeta.replaceResponsibles(manager, 'prompt', packageId, responsibleUserIds);

        const version = manager.create(PromptVersion, {
          prompt_package_id: packageId,
          version_no: placeholderVersionNo,
          old_version: oldVersion,
          state: PromptVersionState.PENDING,
          name: dto.name,
          short_description: dto.short_description,
          category_id: resolvedCategory?.id ?? dto.category_id,
          usage_guide_html: usageGuideHtml,
          kind: dto.kind,
          avatar_url: dto.avatar_url ?? null,
          prompt_content: dto.prompt_content,
          changelog_note: dto.changelog_note ?? null,
          submitted_by: userId,
        });
        const saved = await manager.save(PromptVersion, version);

        await this.itemMeta.replaceVersionTags(manager, 'prompt', saved.id, tagIds);

        return { version: { id: saved.id, version_no: placeholderVersionNo } };
      });
    } catch (err) {
      // Catch PG unique-violation on partial-unique pending index → 409.
      // The constraint uidx_prompt_versions_one_pending_per_package is
      // partial: (prompt_package_id) WHERE state='pending' AND is_deleted=false.
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
        const version = await manager.findOne(PromptVersion, {
          where: { id: versionId, is_deleted: false },
          lock: { mode: 'pessimistic_write' },
        });
        if (!version) throw new NotFoundException('Prompt version not found');
        if (version.state !== PromptVersionState.PENDING) {
          throw new ForbiddenException('Only pending versions can be approved');
        }

        // Finalize the gapless approved number: (predecessor approved ?? 0) + 1. old_version is
        // left untouched so the approved row records what it built on.
        version.version_no = (version.old_version ?? 0) + 1;
        version.state = PromptVersionState.APPROVED;
        version.reviewed_by = userId;
        version.reviewed_at = new Date();
        await manager.save(PromptVersion, version);

        // Promote this version to the active version; ensure package is active.
        const pkg = await manager.findOne(PromptPackage, {
          where: { id: version.prompt_package_id },
        });
        if (!pkg) throw new NotFoundException('Prompt package not found');

        pkg.active_version_id = versionId;
        pkg.status = PromptPackageStatus.ACTIVE;
        await manager.save(PromptPackage, pkg);

        return { version_id: versionId, package_id: version.prompt_package_id };
      });
    } catch (err) {
      // The approved-only partial-unique (prompt_package_id, version_no) can now fire here if a
      // duplicate approved number is ever produced concurrently — surface it as a clean 409.
      if (isPgUniqueViolation(err)) {
        throw new ConflictException('This version number is already approved for this package.');
      }
      throw err;
    }
  }

  // Reject requires a non-empty reason; the DTO's @IsNotEmpty handles the 400 case.
  async reject(versionId: number, dto: RejectPromptVersionDto, userId: number) {
    const version = await this.versionRepo.findOne({ where: { id: versionId, is_deleted: false } });
    if (!version) throw new NotFoundException('Prompt version not found');
    if (version.state !== PromptVersionState.PENDING) {
      throw new ForbiddenException('Only pending versions can be rejected');
    }

    version.state = PromptVersionState.REJECTED;
    version.reviewed_by = userId;
    version.reviewed_at = new Date();
    version.reject_reason = dto.reason;
    await this.versionRepo.save(version);

    return { version_id: versionId };
  }

  // Toggle package active/inactive status. Only approvers can call this endpoint.
  async toggleStatus(packageId: number, dto: ToggleStatusDto) {
    const pkg = await this.packageRepo.findOne({ where: { id: packageId, is_deleted: false } });
    if (!pkg) throw new NotFoundException('Prompt package not found');

    pkg.status = dto.status;
    await this.packageRepo.save(pkg);

    return { id: packageId, status: dto.status };
  }

  // Return which prompt codes the caller holds (BearerGuard-only endpoint).
  async getMyPermissions(userId: number) {
    const codes = await this.permissionQuery.getUserPermissions(userId);
    return {
      canUpload: codes.includes('prompt_upload'),
      canApprove: codes.includes('prompt_approve'),
    };
  }
}
