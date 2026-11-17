import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ApiPackage, ApiPackageStatus } from '@modules/databases/api-catalog-package.entity';
import { ApiVersion, ApiVersionState } from '@modules/databases/api-catalog-version.entity';
import { AssetHubTagKind } from '@modules/databases/asset-hub-tag.entity';
import { AssetHubItemMetaService, packageOwningFields } from '@modules/asset-hub-catalog/asset-hub-item-meta.service';
import { specColumns, validateAndNormalizeSpec } from './api-spec.util';
import { resolveSyncRelations } from './api-catalog-sync-relation-resolver';
import { SyncApiCatalogItemDto } from './dto/sync-api-catalog-item.dto';

export type SyncAction = 'created' | 'updated' | 'unchanged';

export interface SyncResult {
  code: string;
  action: SyncAction;
  package_id: number;
  version_id: number;
  state: ApiVersionState;
}

// Version columns the sync owns. Usage guide and avatar are NOT synced: owners fill them in on the
// web before submitting the draft, so they are left out of both the write and the change check.
type SyncedContent = ReturnType<typeof specColumns> & {
  name: string;
  short_description: string;
  category_id: number | null;
  kind: AssetHubTagKind;
};

// Key-order-insensitive JSON: Postgres jsonb does not keep the key order the client sent.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
const sameJson = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const sortedIds = (ids: number[]) => [...ids].sort((a, b) => a - b);

const LIVE_VERSION = { is_deleted: false } as const;

/**
 * Upsert one API from a third-party sync job, keyed by `code`. The sync never publishes: it writes a
 * DRAFT that the package owners complete (usage guide, avatar, any correction) and submit on the web,
 * after which the normal pending → approve flow applies.
 *
 * - no package for the code → create the package and its first draft
 * - a draft already exists → update that draft in place (guide / avatar typed by owners are kept)
 * - no draft → create one, unless the data equals the pending (or else the active) version
 */
@Injectable()
export class ApiCatalogSyncService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly itemMeta: AssetHubItemMetaService,
  ) {}

  async upsert(dto: SyncApiCatalogItemDto): Promise<SyncResult> {
    const spec = validateAndNormalizeSpec(dto);

    return this.dataSource.transaction(async (manager) => {
      // Serialize concurrent syncs of the same code (covers the create race, where no row exists to lock).
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`api_catalog_sync:${dto.code}`]);

      const rel = await resolveSyncRelations(manager, dto);
      // The creator owns the package: they (and supporters) complete and submit drafts on the web.
      const creatorId = rel.creatorUserId;
      const content: SyncedContent = {
        name: dto.name,
        short_description: dto.short_description,
        category_id: rel.categoryId,
        kind: dto.kind,
        ...specColumns(spec),
      };
      // Owning unit is always sent in full by a sync: omitted or "" clears it.
      const owning = packageOwningFields(rel.publisherId, dto.owning_unit_name ?? '', 'bump');
      const result = (action: SyncAction, packageId: number, version: ApiVersion): SyncResult => ({
        code: dto.code,
        action,
        package_id: packageId,
        version_id: version.id,
        state: version.state,
      });

      const pkg = await manager.findOne(ApiPackage, { where: { code: dto.code, is_deleted: false } });
      if (!pkg) {
        const created = await manager.save(
          ApiPackage,
          manager.create(ApiPackage, {
            code: dto.code,
            status: dto.status ?? ApiPackageStatus.ACTIVE,
            active_version_id: null,
            created_by: creatorId,
            ...owning,
          }),
        );
        await this.itemMeta.replaceResponsibles(manager, 'api-catalog', created.id, rel.responsibleUserIds);
        const draft = await this.saveDraft(manager, created.id, null, content, creatorId, rel.coworkerPackageIds, dto);
        return result('created', created.id, draft);
      }

      // Package-level metadata (incl. the creator) has no version of its own; it is applied on every sync.
      await manager.update(ApiPackage, pkg.id, {
        ...owning,
        created_by: creatorId,
        ...(dto.status ? { status: dto.status } : {}),
      });
      await this.itemMeta.replaceResponsibles(manager, 'api-catalog', pkg.id, rel.responsibleUserIds);

      const draft = await manager.findOne(ApiVersion, {
        where: { api_catalog_package_id: pkg.id, state: ApiVersionState.DRAFT, ...LIVE_VERSION },
        order: { id: 'DESC' },
      });
      if (draft) {
        if (await this.sameAsVersion(manager, draft, content, rel.coworkerPackageIds)) {
          return result('unchanged', pkg.id, draft);
        }
        Object.assign(draft, content);
        draft.changelog_note = dto.changelog_note ?? null;
        await manager.save(ApiVersion, draft);
        await this.itemMeta.replaceVersionCoworkers(manager, 'api-catalog', draft.id, rel.coworkerPackageIds);
        return result('updated', pkg.id, draft);
      }

      // Compare against what owners would otherwise see next: the pending version, else the live one.
      const pending = await manager.findOne(ApiVersion, {
        where: { api_catalog_package_id: pkg.id, state: ApiVersionState.PENDING, ...LIVE_VERSION },
        order: { id: 'DESC' },
      });
      const active =
        !pending && pkg.active_version_id
          ? await manager.findOne(ApiVersion, { where: { id: pkg.active_version_id, ...LIVE_VERSION } })
          : null;
      const base = pending ?? active;
      if (base && (await this.sameAsVersion(manager, base, content, rel.coworkerPackageIds))) {
        return result('unchanged', pkg.id, base);
      }

      const created = await this.saveDraft(manager, pkg.id, base, content, creatorId, rel.coworkerPackageIds, dto);
      return result('updated', pkg.id, created);
    });
  }

  private async sameAsVersion(
    manager: EntityManager,
    version: ApiVersion,
    content: SyncedContent,
    coworkerIds: number[],
  ): Promise<boolean> {
    const fieldsEqual = (Object.keys(content) as Array<keyof SyncedContent>).every((key) =>
      sameJson(version[key] ?? null, content[key] ?? null),
    );
    if (!fieldsEqual) return false;
    const linked: Array<{ coworker_package_id: number }> = await manager.query(
      `SELECT coworker_package_id FROM api_catalog_version_coworkers
       WHERE api_catalog_version_id = $1 AND deleted_at IS NULL AND COALESCE(is_deleted, false) = false`,
      [version.id],
    );
    return sameJson(sortedIds(linked.map((r) => Number(r.coworker_package_id))), sortedIds(coworkerIds));
  }

  // New draft. Guide and avatar are carried over from `base` so owners only touch what changed.
  // version_no / old_version are placeholders here; submitting the draft recomputes them.
  private async saveDraft(
    manager: EntityManager,
    packageId: number,
    base: ApiVersion | null,
    content: SyncedContent,
    submittedBy: number,
    coworkerIds: number[],
    dto: SyncApiCatalogItemDto,
  ): Promise<ApiVersion> {
    const maxRow: Array<{ max: string | null }> = await manager.query(
      `SELECT MAX(version_no) AS max FROM api_catalog_versions
       WHERE api_catalog_package_id = $1 AND state = 'approved' AND is_deleted = false AND deleted_at IS NULL`,
      [packageId],
    );
    const oldVersion = maxRow[0]?.max == null ? null : Number(maxRow[0].max);
    const saved = await manager.save(
      ApiVersion,
      manager.create(ApiVersion, {
        api_catalog_package_id: packageId,
        version_no: oldVersion ?? 1,
        old_version: oldVersion,
        state: ApiVersionState.DRAFT,
        ...content,
        usage_guide_html: base?.usage_guide_html ?? '',
        avatar_url: base?.avatar_url ?? null,
        changelog_note: dto.changelog_note ?? null,
        submitted_by: submittedBy,
      }),
    );
    await this.itemMeta.replaceVersionCoworkers(manager, 'api-catalog', saved.id, coworkerIds);
    return saved;
  }
}
