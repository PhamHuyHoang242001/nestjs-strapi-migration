/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-enum-comparison, @typescript-eslint/no-unsafe-argument */
import { ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { CoworkerPackage, CoworkerPackageStatus } from '@modules/databases/coworker-package.entity';
import { CoworkerVersion, CoworkerVersionState } from '@modules/databases/coworker-version.entity';
import { ListCoworkerQueryDto } from './dto/list-coworker-query.dto';
import { ListVersionsDto } from './dto/list-versions.dto';
import { ReviewQueryDto } from './dto/review-query.dto';
import { PermissionQueryService } from '@common/authorization/services/permission-query.service';
import {
  AssetHubItemMetaReadService,
  PublisherRef,
  ResponsibleUserRef,
} from '@modules/asset-hub-catalog/asset-hub-item-meta-read.service';
import { escapeIlike } from '@modules/asset-hub-catalog/asset-hub-list-filters';
import { OwnerScopeResolverService } from '@common/authorization/services/owner-scope-resolver.service';
import {
  canBumpPackage,
  canSeeInactivePackage,
  inactiveListMode,
  isAiHubWorkspaceSO,
} from '@modules/asset-hub-catalog/ai-hub-package-access.helper';

@Injectable()
export class CoworkerQueryService {
  constructor(
    @InjectRepository(CoworkerPackage)
    private readonly packageRepo: Repository<CoworkerPackage>,
    @InjectRepository(CoworkerVersion)
    private readonly versionRepo: Repository<CoworkerVersion>,
    private readonly permissionQuery: PermissionQueryService,
    private readonly metaRead: AssetHubItemMetaReadService,
    @Optional() private readonly ownerScope?: OwnerScopeResolverService,
  ) {}

  private async isCoworkerSo(userId: number): Promise<boolean> {
    if (!this.ownerScope) return false;
    return isAiHubWorkspaceSO(await this.ownerScope.getUserOwnerScope(userId), 'coworker_packages');
  }

  private async loadPackageMeta(packages: Array<{ id: number; publisher_id?: number | null }>): Promise<{
    publishers: Map<number, PublisherRef>;
    responsibles: Map<number, ResponsibleUserRef[]>;
    supporters: Map<number, ResponsibleUserRef[]>;
  }> {
    const [publishers, responsibles, supporters] = await Promise.all([
      this.metaRead.getPublishersByIds(packages.map((p) => p.publisher_id)),
      this.metaRead.getResponsiblesByPackageIds(
        'coworker',
        packages.map((p) => p.id),
      ),
      this.metaRead.getSupportersByPackageIds(
        'coworker',
        packages.map((p) => p.id),
      ),
    ]);
    return { publishers, responsibles, supporters };
  }

  private async loadChannelsByVersionIds(
    versionIds: Array<number | null | undefined>,
  ): Promise<Map<number, Array<{ id: number; name: string }>>> {
    const map = new Map<number, Array<{ id: number; name: string }>>();
    const ids = Array.from(new Set(versionIds.filter((id): id is number => typeof id === 'number')));
    if (!ids.length) return map;
    const rows = await this.versionRepo.manager.query(
      `SELECT vc.coworker_version_id AS version_id, c.id, c.name
       FROM coworker_version_channels vc
       INNER JOIN ai_hub_coworker_channels c ON c.id = vc.channel_id
         AND c.deleted_at IS NULL AND COALESCE(c.is_deleted, false) = false
       WHERE vc.coworker_version_id = ANY($1)
         AND vc.deleted_at IS NULL AND COALESCE(vc.is_deleted, false) = false
       ORDER BY vc.coworker_version_id, c.id`,
      [ids],
    );
    for (const row of rows) {
      const list = map.get(Number(row.version_id)) ?? [];
      list.push({ id: Number(row.id), name: row.name });
      map.set(Number(row.version_id), list);
    }
    return map;
  }

  private async loadModelsByIds(
    ids: Array<number | null | undefined>,
  ): Promise<Map<number, { id: number; name: string }>> {
    const unique = Array.from(new Set(ids.filter((id): id is number => typeof id === 'number')));
    if (!unique.length) return new Map();
    const rows = await this.versionRepo.manager.query(
      `SELECT id, name FROM ai_hub_coworker_models
       WHERE id = ANY($1) AND deleted_at IS NULL AND COALESCE(is_deleted, false) = false`,
      [unique],
    );
    return new Map(rows.map((r) => [Number(r.id), { id: Number(r.id), name: r.name }]));
  }

  private applyReviewFilters<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    query: ReviewQueryDto,
    alias: string,
  ): void {
    if (query.submitted_by) {
      qb.andWhere(`${alias}.submitted_by = :submitted_by`, { submitted_by: query.submitted_by });
    }
  }

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

  private async resolveEmails(ids: Array<number | null | undefined>): Promise<Map<number, string>> {
    const unique = Array.from(new Set(ids.filter((x): x is number => typeof x === 'number')));
    if (!unique.length) return new Map();
    const rows = await this.versionRepo.manager.query('SELECT id, email FROM users WHERE id = ANY($1)', [unique]);
    return new Map(rows.map((r) => [Number(r.id), r.email]));
  }

  private async resolveIsUpdate(
    packageId: number,
    version: { id: number; state: string },
    canUpload: boolean,
  ): Promise<boolean> {
    if (!canUpload || version.state !== CoworkerVersionState.REJECTED) {
      return false;
    }
    const newestRows = await this.versionRepo.manager.query(
      `SELECT id FROM coworker_versions
       WHERE coworker_package_id = $1 AND is_deleted = false AND deleted_at IS NULL
       ORDER BY id DESC LIMIT 1`,
      [packageId],
    );
    return Number(newestRows[0]?.id) === version.id;
  }

  private applyListFilters<T extends ObjectLiteral>(qb: SelectQueryBuilder<T>, query: ListCoworkerQueryDto): void {
    if (query.search?.trim()) {
      const kw = `%${escapeIlike(query.search.trim())}%`;
      qb.andWhere(
        `(av.name ILIKE :search ESCAPE '\\' OR av.short_description ILIKE :search ESCAPE '\\' OR pkg.code ILIKE :search ESCAPE '\\')`,
        { search: kw },
      );
    }
    if (query.publisher_id) {
      qb.andWhere('pkg.publisher_id = :publisher_id', { publisher_id: query.publisher_id });
    }
  }

  async list(query: ListCoworkerQueryDto, userId: number) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('coworker_approve');
    const isSo = await this.isCoworkerSo(userId);
    const listMode = inactiveListMode(query.status === CoworkerPackageStatus.INACTIVE, canApprove, isSo);
    const statusFilter = listMode === 'active' ? CoworkerPackageStatus.ACTIVE : CoworkerPackageStatus.INACTIVE;

    const qb = this.packageRepo
      .createQueryBuilder('pkg')
      .innerJoinAndMapOne(
        'pkg.active_version',
        CoworkerVersion,
        'av',
        'av.id = pkg.active_version_id AND av.deleted_at IS NULL AND av.is_deleted = false',
      )
      .where('pkg.deleted_at IS NULL')
      .andWhere('COALESCE(pkg.is_deleted, false) = false')
      .andWhere('pkg.status = :status', { status: statusFilter })
      .andWhere('pkg.active_version_id IS NOT NULL');

    const supportedIds =
      listMode === 'own-inactive' ? await this.metaRead.listSupportedPackageIds('coworker', userId) : [];
    if (listMode === 'own-inactive') {
      qb.andWhere('(pkg.created_by = :viewerId OR pkg.id = ANY(:supportedIds))', {
        viewerId: userId,
        supportedIds: supportedIds.length ? supportedIds : [0],
      });
    }

    this.applyListFilters(qb, query);
    qb.orderBy('pkg.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const countQb = this.packageRepo
      .createQueryBuilder('pkg')
      .innerJoin(
        CoworkerVersion,
        'av',
        'av.id = pkg.active_version_id AND av.deleted_at IS NULL AND av.is_deleted = false',
      )
      .where('pkg.deleted_at IS NULL')
      .andWhere('COALESCE(pkg.is_deleted, false) = false')
      .andWhere('pkg.status = :status', { status: statusFilter })
      .andWhere('pkg.active_version_id IS NOT NULL')
      .select('COUNT(pkg.id)', 'count');

    if (listMode === 'own-inactive') {
      countQb.andWhere('(pkg.created_by = :viewerId OR pkg.id = ANY(:supportedIds))', {
        viewerId: userId,
        supportedIds: supportedIds.length ? supportedIds : [0],
      });
    }
    this.applyListFilters(countQb, query);

    const [data, countRow] = await Promise.all([qb.getMany(), countQb.getRawOne<{ count: string }>()]);
    const meta = await this.loadPackageMeta(data);
    const channels = await this.loadChannelsByVersionIds(data.map((pkg) => pkg.active_version_id));
    const models = await this.loadModelsByIds(data.map((pkg) => pkg.active_version?.model_id));

    const shaped = data.map((pkg) => ({
      ...pkg,
      publisher: meta.publishers.get(pkg.publisher_id) ?? null,
      responsible_users: meta.responsibles.get(pkg.id) ?? [],
      supporters: meta.supporters.get(pkg.id) ?? [],
      owning_unit_name: pkg.owning_unit_name ?? null,
      active_version: pkg.active_version
        ? {
            ...pkg.active_version,
            channels: channels.get(pkg.active_version.id) ?? [],
            model: models.get(pkg.active_version.model_id) ?? null,
          }
        : pkg.active_version,
    }));
    return {
      data: shaped,
      meta: { total: Number(countRow?.count ?? 0), page, limit },
    };
  }

  async detail(packageId: number, userId: number) {
    const pkg = await this.attachActiveVersion(
      await this.packageRepo.findOne({
        where: { id: packageId, is_deleted: false },
      }),
    );
    if (!pkg) throw new NotFoundException('Coworker package not found');

    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('coworker_approve');
    const canUpload = codes.includes('coworker_upload');
    const isOwner = pkg.created_by === userId;
    const isSo = await this.isCoworkerSo(userId);
    const supporterRows = await this.metaRead.getSupportersByPackageIds('coworker', [pkg.id]);
    const supporterIds = (supporterRows.get(pkg.id) ?? []).map((s) => s.id);
    const isSupporter = supporterIds.includes(userId);

    if (
      pkg.status === CoworkerPackageStatus.INACTIVE &&
      !canSeeInactivePackage({ isOwner, isSupporter, canApprove, isSo })
    ) {
      throw new NotFoundException('Coworker package not found or inactive');
    }

    const versions = await this.versionRepo.find({
      where: { coworker_package_id: packageId, is_deleted: false, state: CoworkerVersionState.APPROVED },
      order: { id: 'DESC' },
      select: ['id', 'version_no', 'reviewed_at'],
    });

    const isUpdate = canBumpPackage({
      userId,
      createdBy: pkg.created_by,
      hasUpload: canUpload,
      supporterIds,
    });
    const hasPendingVersion =
      (await this.versionRepo.count({
        where: { coworker_package_id: packageId, is_deleted: false, state: CoworkerVersionState.PENDING },
      })) > 0;

    const emailMap = await this.resolveEmails([pkg.active_version?.submitted_by]);
    const meta = await this.loadPackageMeta([pkg]);
    const channels = await this.loadChannelsByVersionIds([pkg.active_version_id]);
    const models = await this.loadModelsByIds([pkg.active_version?.model_id]);
    const formattedActive = pkg.active_version
      ? {
          ...pkg.active_version,
          submitted_by_email: emailMap.get(pkg.active_version.submitted_by) ?? null,
          channels: channels.get(pkg.active_version.id) ?? [],
          model: models.get(pkg.active_version.model_id) ?? null,
        }
      : pkg.active_version;
    const activeId = pkg.active_version_id ?? pkg.active_version?.id;
    return {
      ...pkg,
      publisher: meta.publishers.get(pkg.publisher_id) ?? null,
      responsible_users: meta.responsibles.get(pkg.id) ?? [],
      supporters: meta.supporters.get(pkg.id) ?? supporterRows.get(pkg.id) ?? [],
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

  async listVersions(query: ListVersionsDto, userId: number) {
    const params: unknown[] = [];
    const where: string[] = ['v.is_deleted = false', 'v.deleted_at IS NULL', 'p.is_deleted = false'];
    params.push(userId);
    where.push(`(v.submitted_by = $${params.length} OR p.created_by = $${params.length})`);
    if (query.coworker_package_id?.length) {
      params.push(query.coworker_package_id);
      where.push(`p.id = ANY($${params.length})`);
    }
    const whereSql = where.join(' AND ');

    if (query.codesOnly) {
      const rows = await this.versionRepo.manager.query(
        `SELECT DISTINCT ON (p.code) p.id AS package_id, p.code, v.name AS package_name
         FROM coworker_versions v
         INNER JOIN coworker_packages p ON p.id = v.coworker_package_id
         WHERE ${whereSql}
         ORDER BY p.code, v.id DESC`,
        params,
      );
      return { data: rows.map((r) => ({ ...r, package_id: Number(r.package_id) })) };
    }

    const rowParams = [...params];
    let stateSql = '';
    if (query.state && query.state !== 'all') {
      rowParams.push(query.state);
      stateSql = ` AND v.state = $${rowParams.length}`;
    }

    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const orderDir = query.sort === 'oldest' ? 'ASC' : 'DESC';

    const countRows = await this.versionRepo.manager.query(
      `SELECT COUNT(*)::int AS total
       FROM coworker_versions v
       INNER JOIN coworker_packages p ON p.id = v.coworker_package_id
       WHERE ${whereSql}${stateSql}`,
      rowParams,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canUpload = codes.includes('coworker_upload');

    const limitIdx = rowParams.push(pageSize);
    const offsetIdx = rowParams.push((page - 1) * pageSize);
    const rows = await this.versionRepo.manager.query(
      `SELECT p.id AS package_id, p.code, v.id AS version_id, v.name AS package_name,
              v.old_version, v.version_no, v.state, v.submitted_by, v.created_at, v.avatar_url,
              (
                v.state = 'rejected'
                AND v.id = (
                  SELECT MAX(latest.id) FROM coworker_versions latest
                  WHERE latest.coworker_package_id = v.coworker_package_id
                    AND latest.is_deleted = false AND latest.deleted_at IS NULL
                )
              ) AS is_update
       FROM coworker_versions v
       INNER JOIN coworker_packages p ON p.id = v.coworker_package_id
       WHERE ${whereSql}${stateSql}
       ORDER BY v.created_at ${orderDir}, v.id ${orderDir}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      rowParams,
    );

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
      avatar_url: r.avatar_url ?? null,
      is_first_pending: r.state === CoworkerVersionState.PENDING && r.old_version == null,
      isUpdate: canUpload && r.is_update === true,
    }));

    return { data, meta: { total, page, limit: pageSize } };
  }

  async listReviews(query: ReviewQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const qb = this.versionRepo
      .createQueryBuilder('cv')
      .where('cv.deleted_at IS NULL')
      .andWhere('COALESCE(cv.is_deleted, false) = false')
      .andWhere('cv.state = :state', { state: CoworkerVersionState.PENDING });

    this.applyReviewFilters(qb, query, 'cv');
    this.applyReviewSort(qb, query, 'cv');
    qb.skip((page - 1) * limit).take(limit);

    const countQb = this.versionRepo
      .createQueryBuilder('cv')
      .where('cv.deleted_at IS NULL')
      .andWhere('COALESCE(cv.is_deleted, false) = false')
      .andWhere('cv.state = :state', { state: CoworkerVersionState.PENDING })
      .select('COUNT(cv.id)', 'count');
    this.applyReviewFilters(countQb, query, 'cv');

    const [data, countRow] = await Promise.all([qb.getMany(), countQb.getRawOne<{ count: string }>()]);
    const emailMap = await this.resolveEmails(data.map((v) => v.submitted_by));
    const channels = await this.loadChannelsByVersionIds(data.map((v) => v.id));
    const models = await this.loadModelsByIds(data.map((v) => v.model_id));
    return {
      data: data.map((v) => ({
        ...v,
        channels: channels.get(v.id) ?? [],
        model: models.get(v.model_id) ?? null,
        submitted_by_email: emailMap.get(v.submitted_by) ?? null,
      })),
      meta: { total: Number(countRow?.count ?? 0), page, limit },
    };
  }

  async listReviewSubmitters() {
    const rows = await this.versionRepo.manager.query(
      `SELECT DISTINCT v.submitted_by AS id, u.email
         FROM coworker_versions v
         LEFT JOIN users u ON u.id = v.submitted_by
        WHERE v.state = 'pending'
          AND v.deleted_at IS NULL
          AND COALESCE(v.is_deleted, false) = false
        ORDER BY u.email ASC NULLS LAST, v.submitted_by ASC`,
    );
    return { data: rows.map((row) => ({ id: Number(row.id), email: row.email ?? null })) };
  }

  async versionDetail(versionId: number, userId: number) {
    const version = await this.versionRepo.findOne({
      where: { id: versionId, is_deleted: false, deleted_at: IsNull() },
    });
    if (!version) throw new NotFoundException('Coworker version not found');

    const pkg = await this.packageRepo.findOne({
      where: { id: version.coworker_package_id, is_deleted: false, deleted_at: IsNull() },
    });
    if (!pkg) throw new NotFoundException('Coworker package not found');

    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('coworker_approve');
    const canAccess = version.submitted_by === userId || pkg.created_by === userId || canApprove;
    if (!canAccess) throw new ForbiddenException('You do not have access to this coworker version');

    let comparison: {
      base_version_id: number | null;
      base_version_no: number | null;
      base: string | null;
      incoming: string;
    } | null = null;

    if (version.state === CoworkerVersionState.PENDING) {
      let predecessor: CoworkerVersion | null = null;
      if (version.old_version != null) {
        predecessor = await this.versionRepo.findOne({
          where: {
            coworker_package_id: version.coworker_package_id,
            version_no: version.old_version,
            state: CoworkerVersionState.APPROVED,
            is_deleted: false,
            deleted_at: IsNull(),
          },
        });
        if (!predecessor) {
          throw new ConflictException('Approved predecessor for this coworker version was not found');
        }
      }
      comparison = {
        base_version_id: predecessor?.id ?? null,
        base_version_no: predecessor?.version_no ?? null,
        base: predecessor?.link ?? null,
        incoming: version.link,
      };
    }

    const emailMap = await this.resolveEmails([version.submitted_by, version.reviewed_by].filter(Boolean));
    const meta = await this.loadPackageMeta([pkg]);
    const channels = await this.loadChannelsByVersionIds([version.id]);
    const models = await this.loadModelsByIds([version.model_id]);
    const isUpdate = await this.resolveIsUpdate(pkg.id, version, codes.includes('coworker_upload'));
    return {
      package: {
        id: pkg.id,
        code: pkg.code,
        status: pkg.status,
        active_version_id: pkg.active_version_id,
        created_by: pkg.created_by,
        publisher: meta.publishers.get(pkg.publisher_id) ?? null,
        responsible_users: meta.responsibles.get(pkg.id) ?? [],
        supporters: meta.supporters.get(pkg.id) ?? [],
        owning_unit_name: pkg.owning_unit_name ?? null,
      },
      version: {
        ...version,
        channels: channels.get(version.id) ?? [],
        model: models.get(version.model_id) ?? null,
        submitted_by_email: emailMap.get(version.submitted_by) ?? null,
        reviewed_by_email: version.reviewed_by ? (emailMap.get(version.reviewed_by) ?? null) : null,
        isUpdate,
      },
      comparison,
      can_review: version.state === CoworkerVersionState.PENDING && canApprove,
      isUpdate,
    };
  }

  async getDiff(versionId: number, userId: number) {
    const version = await this.versionRepo.findOne({
      where: { id: versionId, is_deleted: false },
    });
    if (!version) throw new NotFoundException('Coworker version not found');

    const codes = await this.permissionQuery.getUserPermissions(userId);
    const canApprove = codes.includes('coworker_approve');
    const pkg = await this.packageRepo.findOne({
      where: { id: version.coworker_package_id },
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
      baseContent = activeVersion?.link ?? null;
    }

    const emailMap = await this.resolveEmails([version.submitted_by]);
    const isUpdate = pkg ? await this.resolveIsUpdate(pkg.id, version, codes.includes('coworker_upload')) : false;
    const channels = await this.loadChannelsByVersionIds([version.id]);
    const models = await this.loadModelsByIds([version.model_id]);

    return {
      base: baseContent,
      incoming: version.link,
      isUpdate,
      metadata: {
        version_id: version.id,
        version_no: version.version_no,
        code: pkg?.code ?? null,
        old_version: version.old_version ?? null,
        state: version.state,
        name: version.name,
        avatar_url: version.avatar_url ?? null,
        channels: channels.get(version.id) ?? [],
        model: models.get(version.model_id) ?? null,
        changelog_note: version.changelog_note,
        submitted_by: version.submitted_by,
        submitted_by_email: emailMap.get(version.submitted_by) ?? null,
        submitted_at: version.created_at,
        isUpdate,
      },
    };
  }

  private async attachActiveVersion(pkg: CoworkerPackage | null): Promise<CoworkerPackage | null> {
    if (!pkg) return pkg;
    if (pkg.active_version !== undefined) return pkg;
    if (!pkg.active_version_id) {
      pkg.active_version = null;
      return pkg;
    }
    const loaded = await this.versionRepo.findOne({ where: { id: pkg.active_version_id } });
    pkg.active_version = loaded ?? pkg.active_version ?? null;
    return pkg;
  }
}
