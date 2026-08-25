import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import type { AssetHubWorkspace } from './asset-hub-item-meta.service';

// Live-row predicates shared by list filters and the batch tag loaders.
export const LIVE_VERSION_TAG = 'vt.deleted_at IS NULL AND COALESCE(vt.is_deleted, false) = false';
export const LIVE_TAG = 't.deleted_at IS NULL AND COALESCE(t.is_deleted, false) = false';

// Trusted identifiers only — never interpolated from request input.
const VERSION_TAG_TABLE: Record<AssetHubWorkspace, { table: string; fk: string }> = {
  skill: { table: 'skill_version_tags', fk: 'skill_version_id' },
  prompt: { table: 'prompt_version_tags', fk: 'prompt_version_id' },
  'api-catalog': { table: 'api_catalog_version_tags', fk: 'api_catalog_version_id' },
};

export interface AssetHubCatalogListQuery {
  search?: string;
  category_id?: number;
  publisher_id?: number;
}

// ILIKE treats % and _ as wildcards. Escape them (and the escape char itself) so a typed
// keyword is always a literal substring, not a pattern.
export function escapeIlike(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

// Tag-name matching is a NON-correlated subquery on pkg.active_version_id so it survives
// TypeORM's skip/take DISTINCT rewrite (a correlated subquery previously 42601'd). Identical
// clause is reusable on the count builder. Tag lookup is keyword-only — list APIs do not
// accept tag_ids / kind as discrete filters.
export function applyAssetHubCatalogFilters<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  workspace: AssetHubWorkspace,
  query: AssetHubCatalogListQuery,
): void {
  const { table, fk } = VERSION_TAG_TABLE[workspace];

  if (query.search?.trim()) {
    const kw = `%${escapeIlike(query.search.trim())}%`;
    qb.andWhere(
      `(av.name ILIKE :search ESCAPE '\\'
        OR av.short_description ILIKE :search ESCAPE '\\'
        OR pkg.active_version_id IN (
          SELECT vt.${fk} FROM ${table} vt
          INNER JOIN ai_hub_tags t ON t.id = vt.tag_id AND ${LIVE_TAG}
          WHERE t.name ILIKE :search ESCAPE '\\' AND ${LIVE_VERSION_TAG}
        ))`,
      { search: kw },
    );
  }

  if (query.category_id) {
    qb.andWhere('av.category_id = :category_id', { category_id: query.category_id });
  }

  if (query.publisher_id) {
    qb.andWhere('pkg.publisher_id = :publisher_id', { publisher_id: query.publisher_id });
  }
}
