import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

const GET_USER_PERMISSIONS_SQL = `
WITH role_permissions AS (
  SELECT DISTINCT p.code
  FROM user_roles ur
  JOIN role r ON r.id = ur.role_id
    AND r.status = 'active'
    AND r.deleted_at IS NULL
  JOIN roles_permissions rp ON rp.role_id = r.id
  JOIN permission p ON p.id = rp.permission_id
    AND p.is_active = true
    AND p.deleted_at IS NULL
  WHERE ur.user_id = $1
    AND ur.deleted_at IS NULL
),
exception_user_permissions AS (
  SELECT DISTINCT p.code
  FROM data_access_users dau
  JOIN data_access da ON da.id = dau.data_access_id
    AND da.scope_type = 'allow'
    AND da.deleted_at IS NULL
    AND (da.start_date IS NULL OR da.start_date <= NOW())
    AND (da.end_date IS NULL OR da.end_date >= NOW())
  JOIN data_permissions dp ON dp.data_access_id = da.id
    AND dp.deleted_at IS NULL
  JOIN permission p ON p.id = dp.permission_id
    AND p.is_active = true
    AND p.deleted_at IS NULL
  WHERE dau.user_id = $1
    AND dau.deleted_at IS NULL
)
SELECT code FROM role_permissions
UNION
SELECT code FROM exception_user_permissions
`;

const GET_ACCESSIBLE_RECORDS_SQL = `
WITH user_role_ids AS (
  SELECT ur.role_id
  FROM user_roles ur
  JOIN role r ON r.id = ur.role_id
    AND r.status = 'active'
    AND r.deleted_at IS NULL
  WHERE ur.user_id = $1
    AND ur.deleted_at IS NULL
),
allow_via_role AS (
  SELECT da.data_id
  FROM data_access_roles dar
  JOIN data_access da ON da.id = dar.data_access_id
    AND da.table_name = $2
    AND da.scope_type = 'allow'
    AND da.deleted_at IS NULL
    AND (da.start_date IS NULL OR da.start_date <= NOW())
    AND (da.end_date IS NULL OR da.end_date >= NOW())
  WHERE dar.role_id IN (SELECT role_id FROM user_role_ids)
    AND dar.deleted_at IS NULL
    AND (
      $3::text IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM data_permissions dp2
        WHERE dp2.data_access_id = da.id AND dp2.deleted_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM data_permissions dp
        JOIN permission p ON p.id = dp.permission_id AND p.code = $3
        WHERE dp.data_access_id = da.id AND dp.deleted_at IS NULL
      )
    )
),
allow_via_user AS (
  SELECT da.data_id
  FROM data_access_users dau
  JOIN data_access da ON da.id = dau.data_access_id
    AND da.table_name = $2
    AND da.scope_type = 'allow'
    AND da.deleted_at IS NULL
    AND (da.start_date IS NULL OR da.start_date <= NOW())
    AND (da.end_date IS NULL OR da.end_date >= NOW())
  WHERE dau.user_id = $1
    AND dau.deleted_at IS NULL
    AND (
      $3::text IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM data_permissions dp2
        WHERE dp2.data_access_id = da.id AND dp2.deleted_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM data_permissions dp
        JOIN permission p ON p.id = dp.permission_id AND p.code = $3
        WHERE dp.data_access_id = da.id AND dp.deleted_at IS NULL
      )
    )
),
deny_via_role AS (
  SELECT da.data_id
  FROM data_access_roles dar
  JOIN data_access da ON da.id = dar.data_access_id
    AND da.table_name = $2
    AND da.scope_type = 'deny'
    AND da.deleted_at IS NULL
    AND (da.start_date IS NULL OR da.start_date <= NOW())
    AND (da.end_date IS NULL OR da.end_date >= NOW())
  WHERE dar.role_id IN (SELECT role_id FROM user_role_ids)
    AND dar.deleted_at IS NULL
),
deny_via_user AS (
  SELECT da.data_id
  FROM data_access_users dau
  JOIN data_access da ON da.id = dau.data_access_id
    AND da.table_name = $2
    AND da.scope_type = 'deny'
    AND da.deleted_at IS NULL
    AND (da.start_date IS NULL OR da.start_date <= NOW())
    AND (da.end_date IS NULL OR da.end_date >= NOW())
  WHERE dau.user_id = $1
    AND dau.deleted_at IS NULL
),
all_allowed AS (
  SELECT data_id FROM allow_via_role
  UNION
  SELECT data_id FROM allow_via_user
),
all_denied AS (
  SELECT data_id FROM deny_via_role
  UNION
  SELECT data_id FROM deny_via_user
)
SELECT data_id FROM all_allowed
EXCEPT
SELECT data_id FROM all_denied
`;

@Injectable()
export class PermissionQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async getUserPermissions(userId: number): Promise<string[]> {
    const rows = await this.dataSource.query<{ code: string }[]>(GET_USER_PERMISSIONS_SQL, [userId]);
    return rows.map((row) => row.code);
  }

  async hasPermission(userId: number, code: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.includes(code);
  }

  async getAccessibleRecords(userId: number, tableName: string, permissionCode?: string): Promise<number[]> {
    const rows = await this.dataSource.query<{ data_id: number | string }[]>(GET_ACCESSIBLE_RECORDS_SQL, [
      userId,
      tableName,
      permissionCode ?? null,
    ]);
    return rows.map((row) => Number(row.data_id));
  }

  async getUserIdsByRole(roleId: number): Promise<number[]> {
    const rows = await this.dataSource.query<{ user_id: number | string }[]>(
      'SELECT user_id FROM user_roles WHERE role_id = $1 AND deleted_at IS NULL',
      [roleId],
    );
    return rows.map((row) => Number(row.user_id));
  }
}
