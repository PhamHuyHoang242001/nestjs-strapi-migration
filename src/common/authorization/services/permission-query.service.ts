import { STATUS } from '@common/enums';
import { SCOPE_TYPE } from '@common/enums';
import { Injectable } from '@nestjs/common';
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
      .innerJoin('r.permissions', 'p')
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
      .andWhere('(da.start_date IS NULL OR da.start_date <= NOW())')
      .andWhere('(da.end_date IS NULL OR da.end_date >= NOW())')
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
    const qb = (repo as Repository<RoleDataAccess | UserDataAccess>)
      .createQueryBuilder(alias)
      .innerJoin(`${alias}.data_access`, 'da')
      .innerJoin('da.module', 'm')
      .select('da.data_id', 'data_id')
      .where(ownerCondition, ownerParams)
      .andWhere(`${alias}.deleted_at IS NULL`)
      .andWhere('m.table_name = :tableName', { tableName })
      .andWhere('da.scope_type = :scopeType', { scopeType })
      .andWhere('da.deleted_at IS NULL')
      .andWhere('(da.start_date IS NULL OR da.start_date <= NOW())')
      .andWhere('(da.end_date IS NULL OR da.end_date >= NOW())');

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
}
