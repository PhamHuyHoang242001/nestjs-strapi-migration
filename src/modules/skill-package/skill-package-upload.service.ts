import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
import { extractSkillMdFromZip } from './skill-zip.util';
import { FetchedFile, SkillFileFetchService } from './skill-file-fetch.util';
import { PermissionQueryService } from '@common/authorization/services/permission-query.service';

// PG unique-violation error code; caught to produce 409 on duplicate-pending.
const PG_UNIQUE_VIOLATION = '23505';

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
  ) {}

  // Upload a new skill package (creates package row + v1 pending version) in one tx.
  // Self-approve is allowed by design — governance is an organisational concern, not enforced here.
  async createNew(dto: CreateSkillPackageDto, userId: number) {
    // Fetch the zip from Strapi (origin + size guarded) BEFORE opening the DB tx —
    // network I/O must not hold a tx lock. skill.md is validated/extracted from the bytes,
    // but only the URL is persisted (diagnostic-style storage — no media row).
    const zipFile = await this.fileFetch.downloadZip(dto.file.fileUrl);
    const skillMdContent = extractSkillMdFromZip(zipFile.buffer);
    // Avatar is stored as-sent (not downloaded); still enforce the Strapi-origin SSRF guard.
    if (dto.avatar_url) this.fileFetch.assertStrapiUrl(dto.avatar_url);

    return this.dataSource.transaction(async (manager) => {
      const savedPkg = await manager.save(
        SkillPackage,
        manager.create(SkillPackage, {
          status: SkillPackageStatus.ACTIVE,
          active_version_id: null,
          created_by: userId,
        }),
      );

      // version_no=1 assigned at submit time (H1 decision).
      const savedVersion = await manager.save(
        SkillVersion,
        manager.create(SkillVersion, {
          skill_package_id: savedPkg.id,
          version_no: 1,
          state: SkillVersionState.PENDING,
          name: dto.name,
          short_description: dto.short_description,
          category: dto.category,
          tags: dto.tags ?? [],
          avatar_url: dto.avatar_url ?? null,
          skill_md_content: skillMdContent,
          changelog_note: null,
          submitted_by: userId,
        }),
      );

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

    // Fetch + validate the zip before opening the tx (no network I/O under a tx lock).
    // Only the URL is persisted (diagnostic-style); the bytes are used solely for skill.md.
    const zipFile = await this.fileFetch.downloadZip(dto.file.fileUrl);
    const skillMdContent = extractSkillMdFromZip(zipFile.buffer);
    if (dto.avatar_url) this.fileFetch.assertStrapiUrl(dto.avatar_url);

    try {
      return await this.dataSource.transaction(async (manager) => {
        // Assign version_no as max(existing) + 1. The SELECT FOR UPDATE on package
        // row plus the unique index (package_id, version_no) together prevent races.
        // If two concurrent submits collide on the partial-unique pending index,
        // PG raises 23505 which we catch below and surface as 409.
        await manager.query('SELECT id FROM skill_packages WHERE id = $1 FOR UPDATE', [packageId]);

        const maxRow = await manager.query<{ max: string | null }[]>(
          'SELECT MAX(version_no) AS max FROM skill_versions WHERE skill_package_id = $1 AND deleted_at IS NULL',
          [packageId],
        );
        const nextVersionNo = Number(maxRow[0]?.max ?? 0) + 1;

        const version = manager.create(SkillVersion, {
          skill_package_id: packageId,
          version_no: nextVersionNo,
          state: SkillVersionState.PENDING,
          name: dto.name,
          short_description: dto.short_description,
          category: dto.category,
          tags: dto.tags ?? [],
          avatar_url: dto.avatar_url ?? null,
          skill_md_content: skillMdContent,
          changelog_note: dto.changelog_note ?? null,
          submitted_by: userId,
        });
        const saved = await manager.save(SkillVersion, version);

        // Persist the zip file row (with metadata) in the same tx. Avatar is inline above.
        await this.saveZipFile(manager, saved.id, dto.file, zipFile);

        return { version: { id: saved.id, version_no: nextVersionNo } };
      });
    } catch (err) {
      // Catch PG unique-violation on partial-unique pending index → 409.
      // The constraint uidx_skill_versions_one_pending_per_package is
      // partial: (skill_package_id) WHERE state='pending' AND is_deleted=false.
      if (err instanceof QueryFailedError && (err as any).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException(
          'A pending version already exists for this package. Approve or reject it before submitting a new one.',
        );
      }
      throw err;
    }
  }

  // Approve a pending version in a single transaction (H2 atomicity requirement).
  // Sets version.state=approved and package.active_version_id = version.id atomically.
  // Previous active version is implicitly superseded — no archived state (M7 decision).
  async approve(versionId: number, userId: number) {
    return this.dataSource.transaction(async (manager) => {
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
