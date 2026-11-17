import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CategoryType } from '@modules/databases/category.entity';

// Live-row filter shared by every lookup (soft-delete has two flags in this schema).
const LIVE = 'deleted_at IS NULL AND COALESCE(is_deleted, false) = false';

// A user may be referenced by a sync only when not deleted and fully active: account status
// active, not switched off by an admin, not blocked. Shared with the users lookup endpoint.
export const ACTIVE_USER_SQL = `${LIVE} AND status = 'active' AND COALESCE(is_active, true) = true AND COALESCE(blocked, false) = false`;

export interface ResolvedSyncRelations {
  categoryId: number;
  publisherId: number;
  creatorUserId: number;
  // Same order as the request emails.
  responsibleUserIds: number[];
  coworkerPackageIds: number[];
}

/**
 * Translate the human-readable keys a sync job sends (category / publisher name, user email,
 * coworker code) into internal ids. Every miss is reported with the offending values, because the
 * caller is a trusted service that needs to know exactly what to fix in its source data.
 */
export async function resolveSyncRelations(
  manager: EntityManager,
  input: {
    category_name: string;
    publisher_name: string;
    creator_email: string;
    responsible_emails: string[];
    coworker_codes?: string[];
  },
): Promise<ResolvedSyncRelations> {
  const categoryRows: Array<{ id: number }> = await manager.query(
    `SELECT id FROM ai_hub_categories
     WHERE LOWER(TRIM(name)) = LOWER($1) AND type = $2 AND is_active = true AND ${LIVE}
     ORDER BY id LIMIT 1`,
    [input.category_name, CategoryType.API_CATALOG],
  );
  if (!categoryRows[0]) {
    throw new BadRequestException(`INVALID_CATEGORY: category "${input.category_name}" not found or inactive`);
  }

  const publisherRows: Array<{ id: number }> = await manager.query(
    `SELECT id FROM ai_hub_publishers WHERE LOWER(TRIM(name)) = LOWER($1) AND ${LIVE} ORDER BY id LIMIT 1`,
    [input.publisher_name],
  );
  if (!publisherRows[0]) {
    throw new BadRequestException(`INVALID_PUBLISHER: publisher "${input.publisher_name}" not found`);
  }

  const emails = input.responsible_emails;
  // One query for the creator and the responsible users; the creator may or may not be one of them.
  const allEmails = [...new Set([input.creator_email, ...emails])];
  const userRows: Array<{ id: number; email: string }> = await manager.query(
    `SELECT DISTINCT ON (LOWER(email)) id, LOWER(email) AS email FROM users
     WHERE LOWER(email) = ANY($1) AND ${ACTIVE_USER_SQL} ORDER BY LOWER(email), id`,
    [allEmails],
  );
  const userIdByEmail = new Map(userRows.map((r) => [r.email, Number(r.id)]));
  if (!userIdByEmail.has(input.creator_email)) {
    throw new BadRequestException(`INVALID_CREATOR: active user not found: ${input.creator_email}`);
  }
  const missingEmails = emails.filter((e) => !userIdByEmail.has(e));
  if (missingEmails.length) {
    throw new BadRequestException(`INVALID_RESPONSIBLE_USERS: active users not found: ${missingEmails.join(', ')}`);
  }

  const codes = input.coworker_codes ?? [];
  let coworkerPackageIds: number[] = [];
  if (codes.length) {
    const coworkerRows: Array<{ id: number; code: string }> = await manager.query(
      `SELECT id, code FROM coworker_packages WHERE code = ANY($1) AND ${LIVE}`,
      [codes],
    );
    const idByCode = new Map(coworkerRows.map((r) => [r.code, Number(r.id)]));
    const missingCodes = codes.filter((c) => !idByCode.has(c));
    if (missingCodes.length) {
      throw new BadRequestException(`INVALID_COWORKERS: coworker codes not found: ${missingCodes.join(', ')}`);
    }
    coworkerPackageIds = codes.map((c) => idByCode.get(c));
  }

  return {
    categoryId: Number(categoryRows[0].id),
    publisherId: Number(publisherRows[0].id),
    creatorUserId: userIdByEmail.get(input.creator_email),
    responsibleUserIds: emails.map((e) => userIdByEmail.get(e)),
    coworkerPackageIds,
  };
}
