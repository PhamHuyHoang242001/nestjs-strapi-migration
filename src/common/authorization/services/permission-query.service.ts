import { STATUS } from '@common/enums';
import { SCOPE_TYPE } from '@common/enums';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RoleDataAccess, UserDataAccess } from '@modules/databases/data-access.entity';
import { UserRole } from '@modules/databases/user-role.entity';
import { Repository } from 'typeorm';

@Injectable()
export class PermissionQueryService {
  constructor(
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(UserDataAccess)
    private readonly userDataAccessRepo: Repository<UserDataAccess>,
    @InjectRepository(RoleDataAccess)
    private readonly roleDataAccessRepo: Repository<RoleDataAccess>,
  ) {}

  async getUserPermissions(userId: number): Promise<string[]> {
    // Role-based permissions: user_roles → role (active) → roles_permissions → permission (active)
    const rolePerms = await this.userRoleRepo
      .createQueryBuilder('ur')
      .innerJoin('ur.role', 'r')
      .innerJoin('r.role_permissions', 'rp')
      .innerJoin('rp.permission', 'p')
      .select('p.code', 'code')
      .where('ur.user_id = :userId', { userId })
      .andWhere('ur.deleted_at IS NULL')
      .andWhere('r.status = :status', { status: STATUS.ACTIVE })
      .andWhere('r.deleted_at IS NULL')
      .andWhere('p.is_active = true')
      .andWhere('p.deleted_at IS NULL')
      .getRawMany<{ code: string }>();

    // Exception permissions: data_access_users → permission (allow, in date range)
    const exceptionPerms = await this.userDataAccessRepo
      .createQueryBuilder('dau')
      .innerJoin('dau.data_access', 'da')
      .innerJoin('dau.permission', 'p')
      .select('p.code', 'code')
      .where('dau.user_id = :userId', { userId })
      .andWhere('dau.deleted_at IS NULL')
      .andWhere('da.scope_type = :scopeType', { scopeType: SCOPE_TYPE.ALLOW })
      .andWhere('da.deleted_at IS NULL')
      // Date-granularity window: start_date counts from the beginning of its day,
      // end_date through the end of its day (so start = end = today is active all day).
      .andWhere('(da.start_date IS NULL OR da.start_date::date <= CURRENT_DATE)')
      .andWhere('(da.end_date IS NULL OR da.end_date::date >= CURRENT_DATE)')
      .andWhere('p.is_active = true')
      .andWhere('p.deleted_at IS NULL')
      .getRawMany<{ code: string }>();

    // DENY is NOT subtracted at API level — it only affects record-level access
    // via getAccessibleRecords(). Subtracting here would globally block the
    // permission even for records that are not denied.
    const codes = new Set<string>();
    for (const row of rolePerms) codes.add(row.code);
    for (const row of exceptionPerms) codes.add(row.code);
    return [...codes];
  }

  async hasPermission(userId: number, code: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.includes(code);
  }

  async getAccessibleRecords(userId: number, tableName: string, permissionCode?: string): Promise<number[]> {
    // Step 1: Get user's active role IDs
    const roleIdRows = await this.userRoleRepo
      .createQueryBuilder('ur')
      .innerJoin('ur.role', 'r')
      .select('ur.role_id', 'role_id')
      .where('ur.user_id = :userId', { userId })
      .andWhere('ur.deleted_at IS NULL')
      .andWhere('r.status = :status', { status: STATUS.ACTIVE })
      .andWhere('r.deleted_at IS NULL')
      .getRawMany<{ role_id: number }>();
    const roleIds = roleIdRows.map((r) => r.role_id);

    // Step 2: Run allow & deny queries in parallel
    const [allowViaRole, allowViaUser, denyViaRole, denyViaUser] = await Promise.all([
      roleIds.length
        ? this.queryDataIds(
            this.roleDataAccessRepo,
            'dar',
            'dar.role_id IN (:...roleIds)',
            { roleIds },
            tableName,
            SCOPE_TYPE.ALLOW,
            permissionCode,
          )
        : ([] as number[]),
      this.queryDataIds(
        this.userDataAccessRepo,
        'dau',
        'dau.user_id = :userId',
        { userId },
        tableName,
        SCOPE_TYPE.ALLOW,
        permissionCode,
      ),
      roleIds.length
        ? this.queryDataIds(
            this.roleDataAccessRepo,
            'dar',
            'dar.role_id IN (:...roleIds)',
            { roleIds },
            tableName,
            SCOPE_TYPE.DENY,
            permissionCode,
          )
        : ([] as number[]),
      this.queryDataIds(
        this.userDataAccessRepo,
        'dau',
        'dau.user_id = :userId',
        { userId },
        tableName,
        SCOPE_TYPE.DENY,
        permissionCode,
      ),
    ]);

    // Step 3: (allow_role ∪ allow_user) \ (deny_role ∪ deny_user)
    const allowed = new Set([...allowViaRole, ...allowViaUser]);
    for (const id of denyViaRole) allowed.delete(id);
    for (const id of denyViaUser) allowed.delete(id);
    return [...allowed];
  }

  async getUserIdsByRole(roleId: number): Promise<number[]> {
    const rows = await this.userRoleRepo
      .createQueryBuilder('ur')
      .select('ur.user_id', 'user_id')
      .where('ur.role_id = :roleId', { roleId })
      .andWhere('ur.deleted_at IS NULL')
      .getRawMany<{ user_id: number | string }>();
    return rows.map((row) => Number(row.user_id));
  }

  // Reverse of getAccessibleRecords: given (table, recordId, code) return the
  // users who explicitly hold `code` on that record. Explicit-only (role_data_access
  // ∪ data_access_users), minus deny — SO owner inheritance + super_admin are NOT
  // applied here. Mirrors queryDataIds guards (tableName regex, soft-delete,
  // date-window, code filter shape per alias). No caching; queries DB every call.
  async getUsersByRecordPermission(
    tableName: string,
    recordId: number,
    permissionCode: string,
  ): Promise<{ id: number; email: string | null }[]> {
    const [allowViaRole, allowViaUser, denyViaRole, denyViaUser] = await Promise.all([
      this.queryUsersForRecord(this.roleDataAccessRepo, 'dar', tableName, recordId, SCOPE_TYPE.ALLOW, permissionCode),
      this.queryUsersForRecord(this.userDataAccessRepo, 'dau', tableName, recordId, SCOPE_TYPE.ALLOW, permissionCode),
      this.queryUsersForRecord(this.roleDataAccessRepo, 'dar', tableName, recordId, SCOPE_TYPE.DENY, permissionCode),
      this.queryUsersForRecord(this.userDataAccessRepo, 'dau', tableName, recordId, SCOPE_TYPE.DENY, permissionCode),
    ]);

    // (allow_role ∪ allow_user) \ (deny_role ∪ deny_user), keyed by user id so
    // the same user reached via both sources collapses to one entry.
    const allowed = new Map<number, { id: number; email: string | null }>();
    for (const u of [...allowViaRole, ...allowViaUser]) allowed.set(u.id, u);
    for (const u of [...denyViaRole, ...denyViaUser]) allowed.delete(u.id);
    return [...allowed.values()];
  }

  // Reverse of queryDataIds: SELECT user WHERE da.data_id = recordId (instead of
  // SELECT data_id WHERE user/role = X). Same guards so it stays consistent with
  // the forward direction.
  private async queryUsersForRecord(
    repo: Repository<RoleDataAccess> | Repository<UserDataAccess>,
    alias: string,
    tableName: string,
    recordId: number,
    scopeType: SCOPE_TYPE,
    permissionCode: string,
  ): Promise<{ id: number; email: string | null }[]> {
    if (!/^[a-z_][a-z0-9_]*$/.test(tableName)) {
      throw new BadRequestException('Invalid data-access table');
    }

    const qb = (repo as Repository<RoleDataAccess | UserDataAccess>)
      .createQueryBuilder(alias)
      .select(['u.id AS id', 'u.email AS email'])
      .distinct()
      .innerJoin(`${alias}.data_access`, 'da')
      .innerJoin('da.module', 'm')
      // Join the target record so a soft-deleted record yields no users.
      .innerJoin(tableName, 'rec', 'rec.id = da.data_id')
      .andWhere(`${alias}.deleted_at IS NULL`)
      // Junction soft-delete has two paths (deleted_at via softDelete, is_deleted via
      // manual update); check both or a junction row deleted via the flag path leaks.
      .andWhere(`${alias}.is_deleted IS NOT TRUE`)
      .andWhere('m.table_name = :tableName', { tableName })
      .andWhere('da.scope_type = :scopeType', { scopeType })
      .andWhere('da.deleted_at IS NULL')
      .andWhere('da.data_id = :recordId', { recordId })
      .andWhere('rec.is_deleted IS NOT TRUE')
      .andWhere('rec.deleted_at IS NULL')
      .andWhere('(da.start_date IS NULL OR da.start_date::date <= CURRENT_DATE)')
      .andWhere('(da.end_date IS NULL OR da.end_date::date >= CURRENT_DATE)');

    if (alias === 'dau') {
      // User-exception: permission lives directly on data_access_users.
      qb.innerJoin(`${alias}.permission`, 'p_filter')
        .innerJoin(`${alias}.user`, 'u')
        .andWhere('p_filter.code = :permCode', { permCode: permissionCode })
        .andWhere('p_filter.is_active = true')
        .andWhere('p_filter.deleted_at IS NULL');
    } else {
      // Role-scoped: permission via roles_permissions; members via role.user_roles.
      qb.innerJoin(`${alias}.role`, 'r')
        .innerJoin('r.user_roles', 'ur')
        .innerJoin('ur.user', 'u')
        .andWhere('r.status = :status', { status: STATUS.ACTIVE })
        .andWhere('r.deleted_at IS NULL')
        .andWhere('ur.deleted_at IS NULL')
        .andWhere(
          `EXISTS (
            SELECT 1
            FROM roles_permissions rp
            JOIN permission p ON p.id = rp.permission_id
            WHERE rp.role_id = ${alias}.role_id
              AND p.code = :permCode
              AND p.is_active = true
              AND p.deleted_at IS NULL
          )`,
          { permCode: permissionCode },
        );
    }

    // Exclude soft-deleted users from the result set.
    qb.andWhere('u.deleted_at IS NULL').andWhere('u.is_deleted IS NOT TRUE');

    const rows = await qb.getRawMany<{ id: number | string; email: string | null }>();
    return rows.map((row) => ({ id: Number(row.id), email: row.email ?? null }));
  }

  /** Shared query: get data_ids from data_access filtered by scope, table, and optional permission code */
  private async queryDataIds(
    repo: Repository<RoleDataAccess> | Repository<UserDataAccess>,
    alias: string,
    ownerCondition: string,
    ownerParams: Record<string, unknown>,
    tableName: string,
    scopeType: SCOPE_TYPE,
    permissionCode?: string,
  ): Promise<number[]> {
    // Table name comes from @RequireDataAccess metadata (DATA_ACCESS_TABLE enum),
    // never user input. Validate as a plain SQL identifier before interpolating it
    // into the raw join below, as defense-in-depth against injection.
    if (!/^[a-z_][a-z0-9_]*$/.test(tableName)) {
      throw new BadRequestException('Invalid data-access table');
    }

    const qb = (repo as Repository<RoleDataAccess | UserDataAccess>)
      .createQueryBuilder(alias)
      .innerJoin(`${alias}.data_access`, 'da')
      .innerJoin('da.module', 'm')
      // Join the target record so soft-deleted records (deleted_at set or
      // is_deleted = true) are excluded from the accessible set, instead of
      // returning their data_ids from the data_access config alone.
      .innerJoin(tableName, 'rec', 'rec.id = da.data_id')
      .select('da.data_id', 'data_id')
      .where(ownerCondition, ownerParams)
      .andWhere(`${alias}.deleted_at IS NULL`)
      // Junction soft-delete has two paths (deleted_at via softDelete, is_deleted via
      // manual update); check both or a junction row deleted via the flag path leaks.
      .andWhere(`${alias}.is_deleted IS NOT TRUE`)
      .andWhere('m.table_name = :tableName', { tableName })
      .andWhere('da.scope_type = :scopeType', { scopeType })
      .andWhere('da.deleted_at IS NULL')
      .andWhere('rec.is_deleted IS NOT TRUE')
      .andWhere('rec.deleted_at IS NULL')
      // Date-granularity window: start_date counts from the beginning of its day,
      // end_date through the end of its day (so start = end = today is active all day).
      .andWhere('(da.start_date IS NULL OR da.start_date::date <= CURRENT_DATE)')
      .andWhere('(da.end_date IS NULL OR da.end_date::date >= CURRENT_DATE)');

    // Permission code filter: users get permissions from data_access_users;
    // roles get permissions from roles_permissions.
    if (permissionCode) {
      if (alias === 'dau') {
        qb.innerJoin(`${alias}.permission`, 'p_filter')
          .andWhere('p_filter.code = :permCode', { permCode: permissionCode })
          .andWhere('p_filter.is_active = true')
          .andWhere('p_filter.deleted_at IS NULL');
      } else {
        qb.andWhere(
          `EXISTS (
            SELECT 1
            FROM roles_permissions rp
            JOIN permission p ON p.id = rp.permission_id
            WHERE rp.role_id = ${alias}.role_id
              AND p.code = :permCode
              AND p.is_active = true
              AND p.deleted_at IS NULL
          )`,
          { permCode: permissionCode },
        );
      }
    }

    const rows = await qb.getRawMany<{ data_id: number | string }>();
    return rows.map((row) => Number(row.data_id));
  }

  private assertTableName(tableName: string): void {
    if (!/^[a-z_][a-z0-9_]*$/.test(tableName)) {
      throw new BadRequestException('Invalid data-access table');
    }
  }

  /**
   * Paged explicit roles that hold `permissionCode` on (table, recordId).
   * allow \ deny. Search on role.name. Page in SQL (LIMIT/OFFSET).
   */
  async listRolesForRecordPaged(
    tableName: string,
    recordId: number,
    permissionCode: string,
    opts: { search?: string; skip: number; take: number },
  ): Promise<{ items: { id: number; name: string }[]; total: number }> {
    this.assertTableName(tableName);
    const search = opts.search?.trim() ? opts.search.trim() : null;
    const cte = this.roleSubjectCte(tableName);
    const countRows = await this.roleDataAccessRepo.query(`${cte} SELECT COUNT(*)::int AS total FROM filtered`, [
      SCOPE_TYPE.ALLOW,
      SCOPE_TYPE.DENY,
      recordId,
      tableName,
      permissionCode,
      search,
    ]);
    const total = Number(countRows[0]?.total ?? 0);
    const itemRows: { id: number | string; name: string }[] = await this.roleDataAccessRepo.query(
      `${cte} SELECT id, name FROM filtered ORDER BY id LIMIT $7 OFFSET $8`,
      [SCOPE_TYPE.ALLOW, SCOPE_TYPE.DENY, recordId, tableName, permissionCode, search, opts.take, opts.skip],
    );
    return {
      total,
      items: itemRows.map((r) => ({ id: Number(r.id), name: r.name })),
    };
  }

  /**
   * Paged explicit users (role members ∪ user-exception) holding `permissionCode`
   * on (table, recordId). allow \ deny. Search on email. Page in SQL.
   */
  async listUsersForRecordPaged(
    tableName: string,
    recordId: number,
    permissionCode: string,
    opts: { search?: string; skip: number; take: number },
  ): Promise<{ items: { id: number; email: string | null }[]; total: number }> {
    this.assertTableName(tableName);
    const search = opts.search?.trim() ? opts.search.trim() : null;
    const cte = this.userSubjectCte(tableName);
    const countRows = await this.roleDataAccessRepo.query(`${cte} SELECT COUNT(*)::int AS total FROM filtered`, [
      SCOPE_TYPE.ALLOW,
      SCOPE_TYPE.DENY,
      recordId,
      tableName,
      permissionCode,
      search,
    ]);
    const total = Number(countRows[0]?.total ?? 0);
    const itemRows: { id: number | string; email: string | null }[] = await this.roleDataAccessRepo.query(
      `${cte} SELECT id, email FROM filtered ORDER BY id LIMIT $7 OFFSET $8`,
      [SCOPE_TYPE.ALLOW, SCOPE_TYPE.DENY, recordId, tableName, permissionCode, search, opts.take, opts.skip],
    );
    return {
      total,
      items: itemRows.map((r) => ({ id: Number(r.id), email: r.email ?? null })),
    };
  }

  private roleGrantSelect(tableName: string, scopeParam: string): string {
    return `
      SELECT DISTINCT r.id, r.name
      FROM data_access_roles dar
      INNER JOIN data_access da ON da.id = dar.data_access_id
      INNER JOIN modules m ON m.id = da.module_id
      INNER JOIN ${tableName} rec ON rec.id = da.data_id
      INNER JOIN role r ON r.id = dar.role_id
      WHERE dar.deleted_at IS NULL
        AND dar.is_deleted IS NOT TRUE
        AND da.deleted_at IS NULL
        AND da.scope_type = ${scopeParam}
        AND da.data_id = $3
        AND m.table_name = $4
        AND rec.is_deleted IS NOT TRUE
        AND rec.deleted_at IS NULL
        AND (da.start_date IS NULL OR da.start_date::date <= CURRENT_DATE)
        AND (da.end_date IS NULL OR da.end_date::date >= CURRENT_DATE)
        AND r.status = '${STATUS.ACTIVE}'
        AND r.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM roles_permissions rp
          JOIN permission p ON p.id = rp.permission_id
          WHERE rp.role_id = dar.role_id
            AND p.code = $5
            AND p.is_active = true
            AND p.deleted_at IS NULL
            AND rp.deleted_at IS NULL
        )`;
  }

  private roleSubjectCte(tableName: string): string {
    return `
      WITH allow_r AS (${this.roleGrantSelect(tableName, '$1')}),
      deny_r AS (${this.roleGrantSelect(tableName, '$2')}),
      filtered AS (
        SELECT a.id, a.name
        FROM allow_r a
        WHERE NOT EXISTS (SELECT 1 FROM deny_r d WHERE d.id = a.id)
          AND ($6::text IS NULL OR a.name ILIKE '%' || $6 || '%')
      )
    `;
  }

  private userGrantSelect(tableName: string, scopeParam: string): string {
    return `
      SELECT DISTINCT u.id, u.email
      FROM data_access_roles dar
      INNER JOIN data_access da ON da.id = dar.data_access_id
      INNER JOIN modules m ON m.id = da.module_id
      INNER JOIN ${tableName} rec ON rec.id = da.data_id
      INNER JOIN role r ON r.id = dar.role_id
      INNER JOIN user_roles ur ON ur.role_id = r.id AND ur.deleted_at IS NULL
      INNER JOIN users u ON u.id = ur.user_id
      WHERE dar.deleted_at IS NULL
        AND dar.is_deleted IS NOT TRUE
        AND da.deleted_at IS NULL
        AND da.scope_type = ${scopeParam}
        AND da.data_id = $3
        AND m.table_name = $4
        AND rec.is_deleted IS NOT TRUE
        AND rec.deleted_at IS NULL
        AND (da.start_date IS NULL OR da.start_date::date <= CURRENT_DATE)
        AND (da.end_date IS NULL OR da.end_date::date >= CURRENT_DATE)
        AND r.status = '${STATUS.ACTIVE}'
        AND r.deleted_at IS NULL
        AND u.deleted_at IS NULL AND u.is_deleted IS NOT TRUE
        AND EXISTS (
          SELECT 1 FROM roles_permissions rp
          JOIN permission p ON p.id = rp.permission_id
          WHERE rp.role_id = dar.role_id
            AND p.code = $5
            AND p.is_active = true
            AND p.deleted_at IS NULL
            AND rp.deleted_at IS NULL
        )
      UNION
      SELECT DISTINCT u.id, u.email
      FROM data_access_users dau
      INNER JOIN data_access da ON da.id = dau.data_access_id
      INNER JOIN modules m ON m.id = da.module_id
      INNER JOIN ${tableName} rec ON rec.id = da.data_id
      INNER JOIN permission p_filter ON p_filter.id = dau.permission_id
      INNER JOIN users u ON u.id = dau.user_id
      WHERE dau.deleted_at IS NULL
        AND dau.is_deleted IS NOT TRUE
        AND da.deleted_at IS NULL
        AND da.scope_type = ${scopeParam}
        AND da.data_id = $3
        AND m.table_name = $4
        AND rec.is_deleted IS NOT TRUE
        AND rec.deleted_at IS NULL
        AND (da.start_date IS NULL OR da.start_date::date <= CURRENT_DATE)
        AND (da.end_date IS NULL OR da.end_date::date >= CURRENT_DATE)
        AND p_filter.code = $5
        AND p_filter.is_active = true
        AND p_filter.deleted_at IS NULL
        AND u.deleted_at IS NULL AND u.is_deleted IS NOT TRUE
    `;
  }

  private userSubjectCte(tableName: string): string {
    return `
      WITH allow_u AS (${this.userGrantSelect(tableName, '$1')}),
      deny_u AS (${this.userGrantSelect(tableName, '$2')}),
      filtered AS (
        SELECT a.id, a.email
        FROM allow_u a
        WHERE NOT EXISTS (SELECT 1 FROM deny_u d WHERE d.id = a.id)
          AND ($6::text IS NULL OR a.email ILIKE '%' || $6 || '%')
      )
    `;
  }
}
