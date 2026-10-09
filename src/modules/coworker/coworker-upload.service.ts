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
import { CoworkerPackage, CoworkerPackageStatus } from '@modules/databases/coworker-package.entity';
import { CoworkerVersion, CoworkerVersionState } from '@modules/databases/coworker-version.entity';
import { CoworkerVersionChannel } from '@modules/databases/coworker-version-channel.entity';
import { CreateCoworkerPackageDto } from './dto/create-coworker-package.dto';
import { CreateCoworkerVersionDto } from './dto/create-coworker-version.dto';
import { RejectCoworkerVersionDto } from './dto/reject-coworker-version.dto';
import { ToggleStatusDto } from './dto/toggle-status.dto';
import { PromptAvatarUrlService } from '@modules/prompt-library/prompt-avatar-url.util';
import { PermissionQueryService } from '@common/authorization/services/permission-query.service';
import { AssetHubItemMetaService, packageOwningFields } from '@modules/asset-hub-catalog/asset-hub-item-meta.service';
import {
  canBumpPackage,
  canTogglePackage,
  isAiHubWorkspaceSO,
} from '@modules/asset-hub-catalog/ai-hub-package-access.helper';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import { assertCoworkerLink } from './coworker-link.util';

const PG_UNIQUE_VIOLATION = '23505';
const PENDING_VERSION_CONFLICT_MESSAGE =
  'A pending version already exists for this package. Approve or reject it before submitting a new one.';
const LATEST_REJECTED_ONLY_MESSAGE = 'Only the latest rejected version of this package can be edited.';
const CODE_CONFLICT_MESSAGE = 'Coworker code already exists';

function isPgUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError && (error as QueryFailedError & { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

function constraintName(error: unknown): string {
  const pg = error as QueryFailedError & {
    constraint?: string;
    driverError?: { constraint?: string; detail?: string };
  };
  return `${pg.constraint ?? ''} ${pg.driverError?.constraint ?? ''} ${pg.driverError?.detail ?? ''}`;
}

@Injectable()
export class CoworkerUploadService {
  constructor(
    @InjectRepository(CoworkerPackage)
    private readonly packageRepo: Repository<CoworkerPackage>,
    @InjectRepository(CoworkerVersion)
    private readonly versionRepo: Repository<CoworkerVersion>,
    private readonly dataSource: DataSource,
    private readonly avatarUrl: PromptAvatarUrlService,
    private readonly permissionQuery: PermissionQueryService,
    private readonly itemMeta: AssetHubItemMetaService,
    @Optional() private readonly ownerScope?: OwnerScopeResolverService,
  ) {}

  private async isCoworkerSo(userId: number): Promise<boolean> {
    if (!this.ownerScope) return false;
    return isAiHubWorkspaceSO(await this.ownerScope.getUserOwnerScope(userId), 'coworker_packages');
  }

  private async assertCanBump(userId: number, createdBy: number, packageId: number): Promise<void> {
    const codes = await this.permissionQuery.getUserPermissions(userId);
    const supporterIds = await this.itemMeta.listSupporterIds(this.dataSource.manager, 'coworker', packageId);
    if (
      !canBumpPackage({
        userId,
        createdBy,
        hasUpload: codes.includes('coworker_upload'),
        supporterIds,
      })
    ) {
      throw new ForbiddenException('You can only update coworker packages you created or support');
    }
  }

  private async applySupporters(
    manager: EntityManager,
    packageId: number,
    supporterIds: number[] | undefined,
  ): Promise<void> {
    if (supporterIds === undefined) return;
    const ids = await this.itemMeta.assertSupporterUsers(manager, supporterIds);
    await this.itemMeta.replaceSupporters(manager, 'coworker', packageId, ids);
  }

  private async assertLookups(manager: EntityManager, channelIds: number[], modelId: number): Promise<number[]> {
    const uniqueChannels = [...new Set(channelIds.filter((id) => Number.isInteger(id) && id > 0))];
    if (!uniqueChannels.length) {
      throw new BadRequestException('INVALID_CHANNELS: at least one channel is required');
    }
    const channelRows: Array<{ id: number }> = await manager.query(
      `SELECT id FROM ai_hub_coworker_channels
       WHERE id = ANY($1) AND deleted_at IS NULL AND is_deleted IS NOT TRUE`,
      [uniqueChannels],
    );
    if (channelRows.length !== uniqueChannels.length) {
      throw new BadRequestException('INVALID_CHANNELS: one or more channels do not exist');
    }
    const modelRows: Array<{ id: number }> = await manager.query(
      `SELECT id FROM ai_hub_coworker_models
       WHERE id = $1 AND deleted_at IS NULL AND is_deleted IS NOT TRUE`,
      [modelId],
    );
    if (!modelRows[0]) {
      throw new BadRequestException('INVALID_MODEL: model does not exist');
    }
    return uniqueChannels;
  }

  private async replaceVersionChannels(manager: EntityManager, versionId: number, channelIds: number[]): Promise<void> {
    await manager.delete(CoworkerVersionChannel, { coworker_version_id: versionId });
    await manager.save(
      channelIds.map((channel_id) =>
        manager.create(CoworkerVersionChannel, { coworker_version_id: versionId, channel_id }),
      ),
    );
  }

  private normalizeCode(code: string): string {
    const trimmed = code.trim();
    if (!trimmed) throw new BadRequestException('INVALID_CODE: code is required');
    return trimmed;
  }

  async createNew(dto: CreateCoworkerPackageDto, userId: number) {
    if (dto.avatar_url) this.avatarUrl.assertStrapiUrl(dto.avatar_url);
    assertCoworkerLink(dto.link);
    const code = this.normalizeCode(dto.code);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const channelIds = await this.assertLookups(manager, dto.channel_ids, dto.model_id);
        const owning = packageOwningFields(dto.publisher_id, dto.owning_unit_name, 'create');
        await this.itemMeta.assertPublisher(manager, owning.publisher_id);
        const responsibleUserIds = await this.itemMeta.assertUsers(manager, dto.responsible_user_ids);

        const savedPkg = await manager.save(
          CoworkerPackage,
          manager.create(CoworkerPackage, {
            status: CoworkerPackageStatus.ACTIVE,
            active_version_id: null,
            created_by: userId,
            code,
            ...owning,
          }),
        );

        await this.itemMeta.replaceResponsibles(manager, 'coworker', savedPkg.id, responsibleUserIds);
        await this.applySupporters(manager, savedPkg.id, dto.supporter_ids ?? []);

        const savedVersion = await manager.save(
          CoworkerVersion,
          manager.create(CoworkerVersion, {
            coworker_package_id: savedPkg.id,
            version_no: 1,
            old_version: null,
            state: CoworkerVersionState.PENDING,
            name: dto.name,
            short_description: dto.short_description,
            kind: dto.kind,
            avatar_url: dto.avatar_url ?? null,
            model_id: dto.model_id,
            link: dto.link,
            changelog_note: null,
            submitted_by: userId,
          }),
        );

        await this.replaceVersionChannels(manager, savedVersion.id, channelIds);
        return { package: { id: savedPkg.id }, version: { id: savedVersion.id, version_no: 1 } };
      });
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        const name = constraintName(err);
        if (name.includes('uidx_coworker_versions_one_pending')) {
          throw new ConflictException(PENDING_VERSION_CONFLICT_MESSAGE);
        }
        throw new ConflictException(CODE_CONFLICT_MESSAGE);
      }
      throw err;
    }
  }

  async createVersion(packageId: number, dto: CreateCoworkerVersionDto, userId: number) {
    const pkg = await this.packageRepo.findOne({ where: { id: packageId, is_deleted: false } });
    if (!pkg) throw new NotFoundException('Coworker package not found');

    await this.assertCanBump(userId, pkg.created_by, packageId);

    const pendingVersion = await this.versionRepo.findOne({
      where: {
        coworker_package_id: packageId,
        state: CoworkerVersionState.PENDING,
        is_deleted: false,
      },
      select: { id: true },
    });
    if (pendingVersion) {
      throw new ConflictException(PENDING_VERSION_CONFLICT_MESSAGE);
    }

    if (dto.avatar_url) this.avatarUrl.assertStrapiUrl(dto.avatar_url);
    assertCoworkerLink(dto.link);

    try {
      return await this.dataSource.transaction(async (manager) => {
        await manager.query('SELECT id FROM coworker_packages WHERE id = $1 FOR UPDATE', [packageId]);

        const maxRow = await manager.query<{ max: string | null }[]>(
          `SELECT MAX(version_no) AS max FROM coworker_versions
           WHERE coworker_package_id = $1 AND state = 'approved' AND is_deleted = false AND deleted_at IS NULL`,
          [packageId],
        );
        const oldVersion = maxRow[0]?.max == null ? null : Number(maxRow[0].max);
        const placeholderVersionNo = oldVersion ?? 1;

        const channelIds = await this.assertLookups(manager, dto.channel_ids, dto.model_id);
        const owning = packageOwningFields(dto.publisher_id, dto.owning_unit_name, 'bump');
        await this.itemMeta.assertPublisher(manager, owning.publisher_id);
        const responsibleUserIds = await this.itemMeta.assertUsers(manager, dto.responsible_user_ids);

        await manager.update(CoworkerPackage, packageId, owning);
        await this.itemMeta.replaceResponsibles(manager, 'coworker', packageId, responsibleUserIds);
        await this.applySupporters(manager, packageId, dto.supporter_ids);

        const saved = await manager.save(
          CoworkerVersion,
          manager.create(CoworkerVersion, {
            coworker_package_id: packageId,
            version_no: placeholderVersionNo,
            old_version: oldVersion,
            state: CoworkerVersionState.PENDING,
            name: dto.name,
            short_description: dto.short_description,
            kind: dto.kind,
            avatar_url: dto.avatar_url ?? null,
            model_id: dto.model_id,
            link: dto.link,
            changelog_note: dto.changelog_note,
            submitted_by: userId,
          }),
        );

        await this.replaceVersionChannels(manager, saved.id, channelIds);
        return { version: { id: saved.id, version_no: placeholderVersionNo } };
      });
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        throw new ConflictException(PENDING_VERSION_CONFLICT_MESSAGE);
      }
      throw err;
    }
  }

  async editVersion(versionId: number, dto: CreateCoworkerVersionDto, userId: number) {
    const version = await this.versionRepo.findOne({ where: { id: versionId, is_deleted: false } });
    if (!version) throw new NotFoundException('Coworker version not found');

    const pkg = await this.packageRepo.findOne({ where: { id: version.coworker_package_id, is_deleted: false } });
    if (!pkg) throw new NotFoundException('Coworker package not found');

    const soPending = version.state === CoworkerVersionState.PENDING && (await this.isCoworkerSo(userId));
    const approverPending = soPending;

    if (!approverPending) {
      await this.assertCanBump(userId, pkg.created_by, pkg.id);

      const pendingVersion = await this.versionRepo.findOne({
        where: { coworker_package_id: pkg.id, state: CoworkerVersionState.PENDING, is_deleted: false },
        select: { id: true },
      });
      if (pendingVersion) {
        throw new ConflictException(PENDING_VERSION_CONFLICT_MESSAGE);
      }

      const newest = await this.versionRepo.findOne({
        where: { coworker_package_id: pkg.id, is_deleted: false },
        order: { id: 'DESC' },
        select: { id: true, state: true },
      });
      if (!newest || newest.id !== versionId || newest.state !== CoworkerVersionState.REJECTED) {
        throw new ForbiddenException(LATEST_REJECTED_ONLY_MESSAGE);
      }
    }

    if (dto.avatar_url) this.avatarUrl.assertStrapiUrl(dto.avatar_url);
    assertCoworkerLink(dto.link);

    try {
      return await this.dataSource.transaction(async (manager) => {
        await manager.query('SELECT id FROM coworker_packages WHERE id = $1 FOR UPDATE', [pkg.id]);

        if (!approverPending) {
          const pendingRows = await manager.query<{ id: number }[]>(
            `SELECT id FROM coworker_versions
             WHERE coworker_package_id = $1 AND state = 'pending' AND is_deleted = false AND deleted_at IS NULL
             LIMIT 1`,
            [pkg.id],
          );
          if (pendingRows[0]) {
            throw new ConflictException(PENDING_VERSION_CONFLICT_MESSAGE);
          }

          const newestRows = await manager.query<{ id: number; state: string }[]>(
            `SELECT id, state FROM coworker_versions
             WHERE coworker_package_id = $1 AND is_deleted = false AND deleted_at IS NULL
             ORDER BY id DESC LIMIT 1`,
            [pkg.id],
          );
          if (Number(newestRows[0]?.id) !== versionId || newestRows[0]?.state !== 'rejected') {
            throw new ForbiddenException(LATEST_REJECTED_ONLY_MESSAGE);
          }
        }

        const locked = await manager.findOne(CoworkerVersion, {
          where: { id: versionId, is_deleted: false },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked) throw new NotFoundException('Coworker version not found');
        if (approverPending) {
          if (locked.state !== CoworkerVersionState.PENDING) {
            throw new ForbiddenException(LATEST_REJECTED_ONLY_MESSAGE);
          }
        } else if (locked.state !== CoworkerVersionState.REJECTED) {
          throw new ForbiddenException(LATEST_REJECTED_ONLY_MESSAGE);
        }

        const channelIds = await this.assertLookups(manager, dto.channel_ids, dto.model_id);
        const owning = packageOwningFields(dto.publisher_id, dto.owning_unit_name, 'bump');
        await this.itemMeta.assertPublisher(manager, owning.publisher_id);
        const responsibleUserIds = await this.itemMeta.assertUsers(manager, dto.responsible_user_ids);

        await manager.update(CoworkerPackage, pkg.id, owning);
        await this.itemMeta.replaceResponsibles(manager, 'coworker', pkg.id, responsibleUserIds);
        if (!approverPending) {
          await this.applySupporters(manager, pkg.id, dto.supporter_ids);
        }

        locked.name = dto.name;
        locked.short_description = dto.short_description;
        locked.kind = dto.kind;
        locked.avatar_url = dto.avatar_url ?? null;
        locked.model_id = dto.model_id;
        locked.link = dto.link;
        locked.changelog_note = dto.changelog_note;
        if (!approverPending) {
          locked.submitted_by = userId;
          locked.state = CoworkerVersionState.PENDING;
          locked.reject_reason = null;
          locked.reviewed_by = null;
          locked.reviewed_at = null;
        }
        await manager.save(CoworkerVersion, locked);
        await this.replaceVersionChannels(manager, locked.id, channelIds);

        return { version: { id: locked.id, version_no: locked.version_no } };
      });
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        throw new ConflictException(PENDING_VERSION_CONFLICT_MESSAGE);
      }
      throw err;
    }
  }

  async approve(versionId: number, userId: number) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const version = await manager.findOne(CoworkerVersion, {
          where: { id: versionId, is_deleted: false },
          lock: { mode: 'pessimistic_write' },
        });
        if (!version) throw new NotFoundException('Coworker version not found');
        if (version.state !== CoworkerVersionState.PENDING) {
          throw new ForbiddenException('Only pending versions can be approved');
        }

        version.version_no = (version.old_version ?? 0) + 1;
        version.state = CoworkerVersionState.APPROVED;
        version.reviewed_by = userId;
        version.reviewed_at = new Date();
        await manager.save(CoworkerVersion, version);

        const pkg = await manager.findOne(CoworkerPackage, {
          where: { id: version.coworker_package_id },
        });
        if (!pkg) throw new NotFoundException('Coworker package not found');

        pkg.active_version_id = versionId;
        pkg.status = CoworkerPackageStatus.ACTIVE;
        await manager.save(CoworkerPackage, pkg);

        return { version_id: versionId, package_id: version.coworker_package_id };
      });
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        throw new ConflictException('This version number is already approved for this package.');
      }
      throw err;
    }
  }

  async reject(versionId: number, dto: RejectCoworkerVersionDto, userId: number) {
    const version = await this.versionRepo.findOne({ where: { id: versionId, is_deleted: false } });
    if (!version) throw new NotFoundException('Coworker version not found');
    if (version.state !== CoworkerVersionState.PENDING) {
      throw new ForbiddenException('Only pending versions can be rejected');
    }

    version.state = CoworkerVersionState.REJECTED;
    version.reviewed_by = userId;
    version.reviewed_at = new Date();
    version.reject_reason = dto.reason;
    await this.versionRepo.save(version);

    return { version_id: versionId };
  }

  async toggleStatus(packageId: number, dto: ToggleStatusDto, userId: number) {
    const pkg = await this.packageRepo.findOne({ where: { id: packageId, is_deleted: false } });
    if (!pkg) throw new NotFoundException('Coworker package not found');

    const isSo = await this.isCoworkerSo(userId);
    const supporterIds = await this.itemMeta.listSupporterIds(this.dataSource.manager, 'coworker', packageId);
    if (!canTogglePackage({ userId, createdBy: pkg.created_by, supporterIds, isSo })) {
      throw new ForbiddenException('You can only toggle coworker packages you created or support');
    }

    pkg.status = dto.status;
    await this.packageRepo.save(pkg);

    return { id: packageId, status: dto.status };
  }

  async getMyPermissions(userId: number) {
    const codes = await this.permissionQuery.getUserPermissions(userId);
    return {
      canUpload: codes.includes('coworker_upload'),
      canApprove: codes.includes('coworker_approve'),
      isWorkspaceSO: await this.isCoworkerSo(userId),
    };
  }
}
