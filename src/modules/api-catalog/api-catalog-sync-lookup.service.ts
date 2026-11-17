import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { standardizePagination } from '@common/utils';
import { CategoryType } from '@modules/databases/category.entity';
import { SyncLookupUsersQueryDto } from './dto/sync-lookup-users-query.dto';
import { ACTIVE_USER_SQL } from './api-catalog-sync-relation-resolver';

// Live-row filter, same rule the sync resolver applies, so every value listed here is accepted by the sync.
const LIVE = 'deleted_at IS NULL AND COALESCE(is_deleted, false) = false';

/**
 * Valid values for the relation fields of the sync body (category_name, publisher_name,
 * responsible_emails, coworker_codes). Returned keys are exactly what the sync expects.
 */
@Injectable()
export class ApiCatalogSyncLookupService {
  constructor(private readonly dataSource: DataSource) {}

  async categories(): Promise<{ data: Array<{ name: string }> }> {
    const data: Array<{ name: string }> = await this.dataSource.query(
      `SELECT name FROM ai_hub_categories WHERE type = $1 AND is_active = true AND ${LIVE} ORDER BY name`,
      [CategoryType.API_CATALOG],
    );
    return { data };
  }

  async publishers(): Promise<{ data: Array<{ name: string }> }> {
    const data: Array<{ name: string }> = await this.dataSource.query(
      `SELECT name FROM ai_hub_publishers WHERE ${LIVE} ORDER BY name`,
    );
    return { data };
  }

  // Coworker display name comes from its active version (the package row only holds the code).
  async coworkers(): Promise<{ data: Array<{ code: string; name: string | null }> }> {
    const data: Array<{ code: string; name: string | null }> = await this.dataSource.query(
      `SELECT p.code, v.name FROM coworker_packages p
       LEFT JOIN coworker_versions v ON v.id = p.active_version_id
       WHERE p.deleted_at IS NULL AND COALESCE(p.is_deleted, false) = false AND p.code <> ''
       ORDER BY p.code`,
    );
    return { data };
  }

  async users(query: SyncLookupUsersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const search = query.search?.trim() ? `%${query.search.trim().toLowerCase()}%` : null;
    const where = `${ACTIVE_USER_SQL} AND email IS NOT NULL AND email <> ''
      AND ($1::text IS NULL OR LOWER(email) LIKE $1 OR LOWER(COALESCE(full_name, '')) LIKE $1)`;

    const data: Array<{ email: string; full_name: string | null }> = await this.dataSource.query(
      `SELECT LOWER(email) AS email, full_name FROM users WHERE ${where} ORDER BY LOWER(email) LIMIT $2 OFFSET $3`,
      [search, limit, (page - 1) * limit],
    );
    const countRows: Array<{ total: string }> = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM users WHERE ${where}`,
      [search],
    );
    return { data, meta: standardizePagination(Number(countRows[0]?.total ?? 0), data.length, limit, page) };
  }
}
