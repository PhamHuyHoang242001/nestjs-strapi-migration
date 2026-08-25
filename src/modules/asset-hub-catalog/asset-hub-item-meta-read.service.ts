import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssetHubTag, AssetHubTagKind } from '@modules/databases/asset-hub-tag.entity';
import type { AssetHubWorkspace } from './asset-hub-item-meta.service';

// Public shape of a tag on any read surface. Replaces the freeform string the jsonb column used to
// carry: the client needs the id to drive filters and the kind to colour the chip.
export interface TagRef {
  id: number;
  name: string;
  kind: AssetHubTagKind;
}

export interface ResponsibleUserRef {
  id: number;
  email: string;
}

export interface PublisherRef {
  id: number;
  name: string;
}

// Trusted internal identifiers — never user input, so they are safe to interpolate. Every value
// that comes from a request is parameter-bound.
const VERSION_TAG_TABLE: Record<AssetHubWorkspace, { table: string; fk: string }> = {
  skill: { table: 'skill_version_tags', fk: 'skill_version_id' },
  prompt: { table: 'prompt_version_tags', fk: 'prompt_version_id' },
  'api-catalog': { table: 'api_catalog_version_tags', fk: 'api_catalog_version_id' },
};

const RESPONSIBLE_TABLE: Record<AssetHubWorkspace, { table: string; fk: string }> = {
  skill: { table: 'skill_package_responsibles', fk: 'skill_package_id' },
  prompt: { table: 'prompt_package_responsibles', fk: 'prompt_package_id' },
  'api-catalog': { table: 'api_catalog_package_responsibles', fk: 'api_catalog_package_id' },
};

const liveIds = (ids: Array<number | null | undefined>): number[] =>
  Array.from(new Set(ids.filter((id): id is number => typeof id === 'number')));

// Batch loaders for the metadata every asset-hub read surface carries. Each method issues exactly
// one query for a whole page, so decorating a list never turns into an N+1.
@Injectable()
export class AssetHubItemMetaReadService {
  constructor(
    @InjectRepository(AssetHubTag)
    private readonly tagRepo: Repository<AssetHubTag>,
  ) {}

  // versionId → its catalog tags, ordered by name so chips render in a stable order.
  async getTagsByVersionIds(
    workspace: AssetHubWorkspace,
    versionIds: Array<number | null | undefined>,
  ): Promise<Map<number, TagRef[]>> {
    const map = new Map<number, TagRef[]>();
    const ids = liveIds(versionIds);
    if (!ids.length) return map;

    const { table, fk } = VERSION_TAG_TABLE[workspace];
    const rows: Array<{ version_id: number; id: number; name: string; kind: AssetHubTagKind }> =
      await this.tagRepo.manager.query(
        `SELECT vt.${fk} AS version_id, t.id, t.name, t.kind
         FROM ${table} vt
         INNER JOIN ai_hub_tags t
           ON t.id = vt.tag_id AND t.deleted_at IS NULL AND COALESCE(t.is_deleted, false) = false
         WHERE vt.${fk} = ANY($1)
           AND vt.deleted_at IS NULL AND COALESCE(vt.is_deleted, false) = false
         ORDER BY vt.${fk}, t.name`,
        [ids],
      );

    for (const row of rows) {
      const list = map.get(Number(row.version_id)) ?? [];
      list.push({ id: Number(row.id), name: row.name, kind: row.kind });
      map.set(Number(row.version_id), list);
    }
    return map;
  }

  // packageId → its people in charge (id + email only, matching the picker's projection).
  async getResponsiblesByPackageIds(
    workspace: AssetHubWorkspace,
    packageIds: Array<number | null | undefined>,
  ): Promise<Map<number, ResponsibleUserRef[]>> {
    const map = new Map<number, ResponsibleUserRef[]>();
    const ids = liveIds(packageIds);
    if (!ids.length) return map;

    const { table, fk } = RESPONSIBLE_TABLE[workspace];
    const rows: Array<{ package_id: number; id: number; email: string }> = await this.tagRepo.manager.query(
      `SELECT r.${fk} AS package_id, u.id, u.email
       FROM ${table} r
       INNER JOIN users u ON u.id = r.user_id AND u.deleted_at IS NULL
       WHERE r.${fk} = ANY($1)
         AND r.deleted_at IS NULL AND COALESCE(r.is_deleted, false) = false
       ORDER BY r.${fk}, u.email`,
      [ids],
    );

    for (const row of rows) {
      const list = map.get(Number(row.package_id)) ?? [];
      list.push({ id: Number(row.id), email: row.email });
      map.set(Number(row.package_id), list);
    }
    return map;
  }

  async getPublishersByIds(publisherIds: Array<number | null | undefined>): Promise<Map<number, PublisherRef>> {
    const ids = liveIds(publisherIds);
    if (!ids.length) return new Map();

    const rows: Array<{ id: number; name: string }> = await this.tagRepo.manager.query(
      `SELECT id, name FROM ai_hub_publishers
       WHERE id = ANY($1) AND deleted_at IS NULL AND COALESCE(is_deleted, false) = false`,
      [ids],
    );
    return new Map(rows.map((row) => [Number(row.id), { id: Number(row.id), name: row.name }]));
  }
}
