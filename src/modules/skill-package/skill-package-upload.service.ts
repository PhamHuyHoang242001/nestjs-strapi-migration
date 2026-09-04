import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
import { SkillPackage, SkillPackageStatus } from '@modules/databases/skill-package.entity';
import { SkillVersion, SkillVersionState } from '@modules/databases/skill-version.entity';
import { SkillVersionFile, SkillVersionFileKind } from '@modules/databases/skill-version-file.entity';
import { CreateSkillPackageDto } from './dto/create-skill-package.dto';
import { CreateSkillVersionDto } from './dto/create-skill-version.dto';
import { SkillFileDto } from './dto/skill-file.dto';
import { RejectSkillVersionDto } from './dto/reject-skill-version.dto';
import { ToggleStatusDto } from './dto/toggle-status.dto';
import { extractSkillZip } from './skill-zip.util';
import { FetchedFile, SkillFileFetchService } from './skill-file-fetch.util';
import { PermissionQueryService } from '@common/authorization/services/permission-query.service';
import { CategoryService } from '@modules/category/category.service';
import { CategoryType } from '@modules/databases/category.entity';
import { AssetHubItemMetaService, packageOwningFields } from '@modules/asset-hub-catalog/asset-hub-item-meta.service';
import { isUsageGuideEmpty, sanitizeUsageGuideHtml } from '@common/utils/usage-guide-html.util';

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
export class SkillPackageUploadService {
  constructor(
    @InjectRepository(SkillPackage)
    private readonly packageRepo: Repository<SkillPackage>,
    @InjectRepository(SkillVersion)
    private readonly versionRepo: Repository<SkillVersion>,
    private readonly dataSource: DataSource,
    private readonly fileFetch: SkillFileFetchService,
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

  // Upload a new skill package (creates package row + v1 pending version) in one tx.
  // Self-approve is allowed by design — governance is an organisational concern, not enforced here.
  async createNew(dto: CreateSkillPackageDto, userId: number) {
    // Read the zip from the shared local upload dir (path + size guarded) BEFORE opening the
    // DB tx — disk I/O must not hold a tx lock. skill.md is validated/extracted from the bytes,
    // but only the URL is persisted (diagnostic-style storage — no media row).
    const zipFile = await this.fileFetch.downloadZip(dto.file.fileUrl);
    const { skillMd: skillMdContent, zipTree } = extractSkillZip(zipFile.buffer);
    // Avatar is stored as-sent (not downloaded); still enforce the Strapi-origin SSRF guard.
    if (dto.avatar_url) this.fileFetch.assertStrapiUrl(dto.avatar_url);
    const usageGuideHtml = this.prepareUsageGuide(dto.usage_guide_html, true);

    return this.dataSource.transaction(async (manager) => {
      const resolvedCategory = await this.categoryService?.validateActive(
        dto.category_id,
        CategoryType.SKILL,
        manager,
      );
      // Reject unknown publisher / user / tag ids before writing anything.
      const owning = packageOwningFields(dto.publisher_id, dto.owning_unit_name, 'create');
      await this.itemMeta.assertPublisher(manager, owning.publisher_id);
      const responsibleUserIds = await this.itemMeta.assertUsers(manager, dto.responsible_user_ids);
      const tagIds = await this.itemMeta.assertTags(manager, dto.tag_ids ?? [], 'skill');

      const savedPkg = await manager.save(
        SkillPackage,
        manager.create(SkillPackage, {
          status: SkillPackageStatus.ACTIVE,
          active_version_id: null,
          created_by: userId,
          ...owning,
          // Placeholder; the real code needs the generated id and is set immediately below.
          code: '',
        }),
      );

      await this.itemMeta.replaceResponsibles(manager, 'skill', savedPkg.id, responsibleUserIds);

      // code = 'skill_<id>' — set post-insert (id known only now) in the SAME tx.
      await manager.update(SkillPackage, savedPkg.id, { code: `skill_${savedPkg.id}` });

      // First-ever version: version_no=1 (NOT NULL) and old_version=NULL (the "mới" signal).
      const savedVersion = await manager.save(
        SkillVersion,
        manager.create(SkillVersion, {
          skill_package_id: savedPkg.id,
          version_no: 1,
          old_version: null,
          state: SkillVersionState.PENDING,
          name: dto.name,
          short_description: dto.short_description,
          category_id: resolvedCategory?.id ?? dto.category_id,
          usage_guide_html: usageGuideHtml,
          kind: dto.kind,
          avatar_url: dto.avatar_url ?? null,
          skill_md_content: skillMdContent,
          zip_tree: zipTree,
          changelog_note: null,
          submitted_by: userId,
        }),
      );

      await this.itemMeta.replaceVersionTags(manager, 'skill', savedVersion.id, tagIds);

      // Persist the zip file row (with metadata) in the same tx. Avatar is inline above.
      await this.saveZipFile(manager, savedVersion.id, dto.file, zipFile);

      return { package: { id: savedPkg.id }, version: { id: savedVersion.id, version_no: 1 } };
    });
  }

  // Upload a new version of an existing package.
  // Catches PG 23505 (partial-unique pending index) and surfaces as 409.
  async createVersion(packageId: number, dto: CreateSkillVersionDto, userId: number) {
    const pkg = await this.packageRepo.findOne({ where: { id: packageId, is_deleted: false } });
    if (!pkg) throw new NotFoundException('Skill package not found');

    // Ownership guard FIRST — before any disk I/O / SSRF-guarded fetch, so an unauthorized caller
    // cannot force a server-side download of an attacker-influenced URL. PermissionGuard already
    // guarantees skill_upload; this adds only the ownership delta: an approver may bump any package,
    // an uploader only their own.
    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('skill_approve');
    if (!canApprove && pkg.created_by !== userId) {
      throw new ForbiddenException('You can only update skill packages you created');
    }

    // Fail fast before reading/parsing the submitted ZIP. The partial unique index remains the
    // concurrency authority; this preflight enforces the business rule with deterministic error
    // precedence and avoids expensive payload work when a review is already outstanding.
    const pendingVersion = await this.versionRepo.findOne({
      where: {
        skill_package_id: packageId,
        state: SkillVersionState.PENDING,
        is_deleted: false,
      },
      select: { id: true },
    });
    if (pendingVersion) {
      throw new ConflictException(PENDING_VERSION_CONFLICT_MESSAGE);
    }

    // Read + validate the zip from local disk before opening the tx (no I/O under a tx lock).
    // Only the URL is persisted (diagnostic-style); the bytes are used solely for skill.md.
    const zipFile = await this.fileFetch.downloadZip(dto.file.fileUrl);
    const { skillMd: skillMdContent, zipTree } = extractSkillZip(zipFile.buffer);
    if (dto.avatar_url) this.fileFetch.assertStrapiUrl(dto.avatar_url);
    // A bump may leave the guide blank — artifacts created before guides existed keep working.
    const usageGuideHtml = this.prepareUsageGuide(dto.usage_guide_html, false);

    try {
      return await this.dataSource.transaction(async (manager) => {
        // Serialize concurrent submits on the same package via a row lock, then derive old_version
        // from the latest APPROVED non-deleted version_no — NOT from active_version_id, which can
        // point at a soft-deleted row. The pending version shares that number as a placeholder
        // (version_no = old_version); approve later finalizes version_no = (old_version ?? 0) + 1.
        // The one-pending partial index still guards against a second pending (23505 → 409 below).
        await manager.query('SELECT id FROM skill_packages WHERE id = $1 FOR UPDATE', [packageId]);

        const maxRow = await manager.query<{ max: string | null }[]>(
          `SELECT MAX(version_no) AS max FROM skill_versions
           WHERE skill_package_id = $1 AND state = 'approved' AND is_deleted = false AND deleted_at IS NULL`,
          [packageId],
        );
        const oldVersion = maxRow[0]?.max == null ? null : Number(maxRow[0].max);
        // version_no stays NOT NULL: fall back to 1 when nothing is approved yet (resubmit after a
        // rejected first version) — same shape as a fresh first pending (old_version NULL).
        const placeholderVersionNo = oldVersion ?? 1;

        const resolvedCategory = await this.categoryService?.validateActive(
          dto.category_id,
          CategoryType.SKILL,
          manager,
        );

        // A bump is also the only edit surface, so the package-level metadata travels with it and
        // is applied in this same transaction — publisher and people in charge first, then the
        // version row, then its tags.
        const owning = packageOwningFields(dto.publisher_id, dto.owning_unit_name, 'bump');
        await this.itemMeta.assertPublisher(manager, owning.publisher_id);
        const responsibleUserIds = await this.itemMeta.assertUsers(manager, dto.responsible_user_ids);
        const tagIds = await this.itemMeta.assertTags(manager, dto.tag_ids ?? [], 'skill');

        await manager.update(SkillPackage, packageId, owning);
        await this.itemMeta.replaceResponsibles(manager, 'skill', packageId, responsibleUserIds);

        const version = manager.create(SkillVersion, {
          skill_package_id: packageId,
          version_no: placeholderVersionNo,
          old_version: oldVersion,
          state: SkillVersionState.PENDING,
          name: dto.name,
          short_description: dto.short_description,
          category_id: resolvedCategory?.id ?? dto.category_id,
          usage_guide_html: usageGuideHtml,
          kind: dto.kind,
          avatar_url: dto.avatar_url ?? null,
          skill_md_content: skillMdContent,
          zip_tree: zipTree,
          changelog_note: dto.changelog_note ?? null,
          submitted_by: userId,
        });
        const saved = await manager.save(SkillVersion, version);

        await this.itemMeta.replaceVersionTags(manager, 'skill', saved.id, tagIds);

        // Persist the zip file row (with metadata) in the same tx. Avatar is inline above.
        await this.saveZipFile(manager, saved.id, dto.file, zipFile);

        return { version: { id: saved.id, version_no: placeholderVersionNo } };
      });
    } catch (err) {
      // Catch PG unique-violation on partial-unique pending index → 409.
      // The constraint uidx_skill_versions_one_pending_per_package is
      // partial: (skill_package_id) WHERE state='pending' AND is_deleted=false.
      if (isPgUniqueViolation(err)) {
        throw new ConflictException(PENDING_VERSION_CONFLICT_MESSAGE);
      }
      throw err;
    }
  }

  // Resubmit the latest rejected version in place (same body as a package bump). Keeps
  // version_no / old_version; flips state back to pending so the one-pending rule still holds.
  async editVersion(versionId: number, dto: CreateSkillVersionDto, userId: number) {
    const version = await this.versionRepo.findOne({ where: { id: versionId, is_deleted: false } });
    if (!version) throw new NotFoundException('Skill version not found');

    const pkg = await this.packageRepo.findOne({ where: { id: version.skill_package_id, is_deleted: false } });
    if (!pkg) throw new NotFoundException('Skill package not found');

    const codes = await this.permissionQuery.getUserPermissions(userId);
    if (
      !codes.includes('skill_upload') ||
      (version.submitted_by !== userId && pkg.created_by !== userId)
    ) {
      throw new ForbiddenException('You can only edit versions you submitted or packages you created');
    }

    const pendingVersion = await this.versionRepo.findOne({
      where: { skill_package_id: pkg.id, state: SkillVersionState.PENDING, is_deleted: false },
      select: { id: true },
    });
    if (pendingVersion) {
      throw new ConflictException(PENDING_VERSION_CONFLICT_MESSAGE);
    }

    const newest = await this.versionRepo.findOne({
      where: { skill_package_id: pkg.id, is_deleted: false },
      order: { id: 'DESC' },
      select: { id: true, state: true },
    });
    if (!newest || newest.id !== versionId || newest.state !== SkillVersionState.REJECTED) {
      throw new ForbiddenException(LATEST_REJECTED_ONLY_MESSAGE);
    }

    const zipFile = await this.fileFetch.downloadZip(dto.file.fileUrl);
    const { skillMd: skillMdContent, zipTree } = extractSkillZip(zipFile.buffer);
    if (dto.avatar_url) this.fileFetch.assertStrapiUrl(dto.avatar_url);
    const usageGuideHtml = this.prepareUsageGuide(dto.usage_guide_html, false);

    try {
      return await this.dataSource.transaction(async (manager) => {
        await manager.query('SELECT id FROM skill_packages WHERE id = $1 FOR UPDATE', [pkg.id]);

        const pendingRows = await manager.query<{ id: number }[]>(
          `SELECT id FROM skill_versions
           WHERE skill_package_id = $1 AND state = 'pending' AND is_deleted = false AND deleted_at IS NULL
           LIMIT 1`,
          [pkg.id],
        );
        if (pendingRows[0]) {
          throw new ConflictException(PENDING_VERSION_CONFLICT_MESSAGE);
        }

        const newestRows = await manager.query<{ id: number; state: string }[]>(
          `SELECT id, state FROM skill_versions
           WHERE skill_package_id = $1 AND is_deleted = false AND deleted_at IS NULL
           ORDER BY id DESC LIMIT 1`,
          [pkg.id],
        );
        if (Number(newestRows[0]?.id) !== versionId || newestRows[0]?.state !== SkillVersionState.REJECTED) {
          throw new ForbiddenException(LATEST_REJECTED_ONLY_MESSAGE);
        }

        const locked = await manager.findOne(SkillVersion, {
          where: { id: versionId, is_deleted: false },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked) throw new NotFoundException('Skill version not found');
        if (locked.state !== SkillVersionState.REJECTED) {
          throw new ForbiddenException(LATEST_REJECTED_ONLY_MESSAGE);
        }

        const resolvedCategory = await this.categoryService?.validateActive(
          dto.category_id,
          CategoryType.SKILL,
          manager,
        );
        const owning = packageOwningFields(dto.publisher_id, dto.owning_unit_name, 'bump');
        await this.itemMeta.assertPublisher(manager, owning.publisher_id);
        const responsibleUserIds = await this.itemMeta.assertUsers(manager, dto.responsible_user_ids);
        const tagIds = await this.itemMeta.assertTags(manager, dto.tag_ids ?? [], 'skill');

        await manager.update(SkillPackage, pkg.id, owning);
        await this.itemMeta.replaceResponsibles(manager, 'skill', pkg.id, responsibleUserIds);

        locked.name = dto.name;
        locked.short_description = dto.short_description;
        locked.category_id = resolvedCategory?.id ?? dto.category_id;
        locked.usage_guide_html = usageGuideHtml;
        locked.kind = dto.kind;
        locked.avatar_url = dto.avatar_url ?? null;
        locked.skill_md_content = skillMdContent;
        locked.zip_tree = zipTree;
        locked.changelog_note = dto.changelog_note ?? null;
        locked.submitted_by = userId;
        locked.state = SkillVersionState.PENDING;
        locked.reject_reason = null;
        locked.reviewed_by = null;
        locked.reviewed_at = null;
        await manager.save(SkillVersion, locked);

        await this.itemMeta.replaceVersionTags(manager, 'skill', locked.id, tagIds);

        await manager.update(
          SkillVersionFile,
          { skill_version_id: locked.id, is_deleted: false },
          { is_deleted: true, deleted_at: new Date() },
        );
        await this.saveZipFile(manager, locked.id, dto.file, zipFile);

        return { version: { id: locked.id, version_no: locked.version_no } };
      });
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        throw new ConflictException(PENDING_VERSION_CONFLICT_MESSAGE);
      }
      throw err;
    }
  }

  // Approve a pending version in a single transaction (H2 atomicity requirement).
  // Sets version.state=approved and package.active_version_id = version.id atomically.
  // Previous active version is implicitly superseded — no archived state (M7 decision).
  async approve(versionId: number, userId: number) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        // pessimistic_write lock: a concurrent second approve blocks here, then
        // reads state=approved and 403s — preventing double-approve overwriting
        // reviewed_by/at under the "only pending can be approved" invariant.
        const version = await manager.findOne(SkillVersion, {
          where: { id: versionId, is_deleted: false },
          lock: { mode: 'pessimistic_write' },
        });
        if (!version) throw new NotFoundException('Skill version not found');
        if (version.state !== SkillVersionState.PENDING) {
          throw new ForbiddenException('Only pending versions can be approved');
        }

        // Finalize the gapless approved number: (predecessor approved ?? 0) + 1. old_version is
        // left untouched so the approved row records what it built on.
        version.version_no = (version.old_version ?? 0) + 1;
        version.state = SkillVersionState.APPROVED;
        version.reviewed_by = userId;
        version.reviewed_at = new Date();
        await manager.save(SkillVersion, version);

        // Promote this version to the active version; ensure package is active.
        const pkg = await manager.findOne(SkillPackage, {
          where: { id: version.skill_package_id },
        });
        if (!pkg) throw new NotFoundException('Skill package not found');

        pkg.active_version_id = versionId;
        pkg.status = SkillPackageStatus.ACTIVE;
        await manager.save(SkillPackage, pkg);

        return { version_id: versionId, package_id: version.skill_package_id };
      });
    } catch (err) {
      // The approved-only partial-unique (skill_package_id, version_no) can now fire here if a
      // duplicate approved number is ever produced concurrently — surface it as a clean 409.
      if (isPgUniqueViolation(err)) {
        throw new ConflictException('This version number is already approved for this package.');
      }
      throw err;
    }
  }

  // Reject requires a non-empty reason; the DTO's @IsNotEmpty handles the 400 case.
  async reject(versionId: number, dto: RejectSkillVersionDto, userId: number) {
    const version = await this.versionRepo.findOne({ where: { id: versionId, is_deleted: false } });
    if (!version) throw new NotFoundException('Skill version not found');
    if (version.state !== SkillVersionState.PENDING) {
      throw new ForbiddenException('Only pending versions can be rejected');
    }

    version.state = SkillVersionState.REJECTED;
    version.reviewed_by = userId;
    version.reviewed_at = new Date();
    version.reject_reason = dto.reason;
    await this.versionRepo.save(version);

    return { version_id: versionId };
  }

  // Toggle package active/inactive status. Only approvers can call this endpoint.
  async toggleStatus(packageId: number, dto: ToggleStatusDto) {
    const pkg = await this.packageRepo.findOne({ where: { id: packageId, is_deleted: false } });
    if (!pkg) throw new NotFoundException('Skill package not found');

    pkg.status = dto.status;
    await this.packageRepo.save(pkg);

    return { id: packageId, status: dto.status };
  }

  // Persist the zip file row for a version. file_url is the URL as-sent by the client (may be
  // relative), matching the diagnostic file_url convention. The display name prefers the client's
  // file.name (diagnostic-parity — the caller supplies the original filename) and falls back to the
  // filename parsed from the download; size/mime stay server-measured (authoritative — the client
  // cannot forge them). The avatar is stored inline on the version (URL only).
  private async saveZipFile(
    manager: EntityManager,
    versionId: number,
    file: SkillFileDto,
    zipFile: FetchedFile,
  ): Promise<void> {
    await manager.save(
      SkillVersionFile,
      manager.create(SkillVersionFile, {
        skill_version_id: versionId,
        file_kind: SkillVersionFileKind.ZIP,
        file_url: file.fileUrl,
        name: file.name ?? zipFile.filename,
        size: zipFile.size,
        mime_type: zipFile.mimeType,
      }),
    );
  }

  // Return which skill codes the caller holds (BearerGuard-only endpoint).
  async getMyPermissions(userId: number) {
    const codes = await this.permissionQuery.getUserPermissions(userId);
    return {
      canUpload: codes.includes('skill_upload'),
      canApprove: codes.includes('skill_approve'),
    };
  }
}
