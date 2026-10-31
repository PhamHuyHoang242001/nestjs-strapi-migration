import { DataSource, EntityManager } from 'typeorm';
import { DH_PERMISSIONS } from '../common/data-hub-permission-codes';
import { escapeLike } from '../common/data-hub-query.util';

type Runner = DataSource | EntityManager;

// Users holding dh_data_service_create and/or dh_data_service_update, with the same grant rules as
// PermissionQueryService.getUserPermissions: active roles (user_roles → role → roles_permissions → permission)
// plus ALLOW data-access exceptions inside their date window. Binds $1 = codes.
const HOLDERS_CTE = `WITH holders AS (
    SELECT ur.user_id, p.code
    FROM user_roles ur
    JOIN role r ON r.id = ur.role_id AND r.status = 'active' AND r.deleted_at IS NULL
    JOIN roles_permissions rp ON rp.role_id = r.id AND rp.deleted_at IS NULL
    JOIN permission p ON p.id = rp.permission_id AND p.is_active = true AND p.deleted_at IS NULL
    WHERE ur.deleted_at IS NULL AND p.code = ANY($1)
    UNION
    SELECT dau.user_id, p.code
    FROM data_access_users dau
    JOIN data_access da ON da.id = dau.data_access_id AND da.scope_type = 'allow' AND da.deleted_at IS NULL
      AND (da.start_date IS NULL OR da.start_date::date <= CURRENT_DATE)
      AND (da.end_date IS NULL OR da.end_date::date >= CURRENT_DATE)
    JOIN permission p ON p.id = dau.permission_id AND p.is_active = true AND p.deleted_at IS NULL
    WHERE dau.deleted_at IS NULL AND p.code = ANY($1)
  )`;

const CODES = [DH_PERMISSIONS.DATA_SERVICE_CREATE, DH_PERMISSIONS.DATA_SERVICE_UPDATE];

const LIVE_USER = `u.deleted_at IS NULL AND COALESCE(u.is_deleted, false) = false`;

export interface RightHolder {
  id: number;
  email: string | null;
  can_create: boolean;
  can_update: boolean;
}

// The subset of userIds that hold at least one data-service right.
export async function holderIdsAmong(runner: Runner, userIds: number[]): Promise<Set<number>> {
  if (userIds.length === 0) return new Set();
  const rows: Array<{ user_id: number }> = await runner.query(
    `${HOLDERS_CTE} SELECT DISTINCT h.user_id FROM holders h WHERE h.user_id = ANY($2)`,
    [CODES, userIds],
  );
  return new Set(rows.map((r) => Number(r.user_id)));
}

// Candidate picker for a department: live holders not yet members, email search, newest-first is meaningless
// for users so ordered by email.
export async function searchRightHolders(
  runner: Runner,
  opts: { excludeDepartmentId: number; keyword?: string; limit: number; offset: number },
): Promise<{ rows: RightHolder[]; total: number }> {
  // Count and page queries bind exactly the parameters they reference: $1 codes, $2 department[, $3 keyword].
  const params: unknown[] = [CODES, opts.excludeDepartmentId];
  let search = '';
  if (opts.keyword) {
    params.push(`%${escapeLike(opts.keyword)}%`);
    search = `AND u.email ILIKE $${params.length} ESCAPE '\\'`;
  }
  const from = `FROM holders h JOIN users u ON u.id = h.user_id AND ${LIVE_USER}
    WHERE NOT EXISTS (SELECT 1 FROM data_hub_department_members m WHERE m.department_id = $2 AND m.user_id = u.id
      AND m.deleted_at IS NULL AND m.is_deleted IS NOT TRUE)
    ${search}`;
  const [count]: Array<{ total: number }> = await runner.query(
    `${HOLDERS_CTE} SELECT COUNT(DISTINCT u.id)::int AS total ${from}`,
    params,
  );
  const n = params.length;
  const rows: Array<{ id: number; email: string | null; can_create: boolean; can_update: boolean }> =
    await runner.query(
      `${HOLDERS_CTE}
       SELECT u.id, u.email, bool_or(h.code = $${n + 1}) AS can_create, bool_or(h.code = $${n + 2}) AS can_update
       ${from}
       GROUP BY u.id, u.email ORDER BY u.email, u.id
       LIMIT $${n + 3} OFFSET $${n + 4}`,
      [...params, DH_PERMISSIONS.DATA_SERVICE_CREATE, DH_PERMISSIONS.DATA_SERVICE_UPDATE, opts.limit, opts.offset],
    );
  return {
    rows: rows.map((r) => ({
      id: Number(r.id),
      email: r.email,
      can_create: !!r.can_create,
      can_update: !!r.can_update,
    })),
    total: Number(count?.total ?? 0),
  };
}
