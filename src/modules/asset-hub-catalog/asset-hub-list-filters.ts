import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import type { AssetHubWorkspace } from './asset-hub-item-meta.service';

// Live-row predicates shared by list filters and the batch tag loaders.
export const LIVE_VERSION_TAG = 'vt.deleted_at IS NULL AND COALESCE(vt.is_deleted, false) = false';
export const LIVE_TAG = 't.deleted_at IS NULL AND COALESCE(t.is_deleted, false) = false';
export const LIVE_COWORKER_PKG = 'cp.deleted_at IS NULL AND COALESCE(cp.is_deleted, false) = false';
export const LIVE_COWORKER_VER = 'cv.deleted_at IS NULL AND COALESCE(cv.is_deleted, false) = false';

// Trusted identifiers only — never interpolated from request input.
const VERSION_COWORKER_TABLE: Record<AssetHubWorkspace, { table: string; fk: string }> = {
  skill: { table: 'skill_version_coworkers', fk: 'skill_version_id' },
  prompt: { table: 'prompt_version_coworkers', fk: 'prompt_version_id' },
  'api-catalog': { table: 'api_catalog_version_coworkers', fk: 'api_catalog_version_id' },
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
  const { table, fk } = VERSION_COWORKER_TABLE[workspace];

  if (query.search?.trim()) {
    const kw = `%${escapeIlike(query.search.trim())}%`;
    qb.andWhere(
      `(av.name ILIKE :search ESCAPE '\\'
        OR av.short_description ILIKE :search ESCAPE '\\'
        OR pkg.active_version_id IN (
          SELECT vt.${fk} FROM ${table} vt
          INNER JOIN coworker_packages cp ON cp.id = vt.coworker_package_id AND ${LIVE_COWORKER_PKG}
          LEFT JOIN coworker_versions cv ON cv.id = cp.active_version_id AND ${LIVE_COWORKER_VER}
          WHERE (cp.code ILIKE :search ESCAPE '\\' OR cv.name ILIKE :search ESCAPE '\\')
            AND ${LIVE_VERSION_TAG}
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
