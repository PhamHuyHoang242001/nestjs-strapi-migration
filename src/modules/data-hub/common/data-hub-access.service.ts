import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PermissionCacheService } from '@common/authorization';
import { USER_CLIENT } from '@common/enums';
import { UserType } from '@modules/databases/user.entity';
import { DH_PERMISSIONS, DataHubPermissionCode } from './data-hub-permission-codes';
import { liveSql } from './data-hub-query.util';

// The authenticated caller as set by BearerGuard (req.info.user + req.info.client).
export interface DataHubCaller {
  id: number;
  type?: string;
  client?: string;
}

export type DataServiceWriteAction = 'create' | 'update';

export interface DataHubMyPermissions {
  is_super_admin: boolean;
  consumer: { create: boolean; update: boolean };
  logical_term: { create: boolean; update: boolean };
  data_service: { create: boolean; update: boolean };
  department: { view: boolean; create: boolean; update: boolean; delete: boolean };
}

const WRITE_CODE: Record<DataServiceWriteAction, DataHubPermissionCode> = {
  create: DH_PERMISSIONS.DATA_SERVICE_CREATE,
  update: DH_PERMISSIONS.DATA_SERVICE_UPDATE,
};

// Single place that answers "may this caller do X" for Data Hub: role codes (cached by PermissionCacheService),
// the super_admin bypass (same rule as PermissionGuard) and department membership for data service writes.
// Membership is read straight from the DB, so adding/removing a member applies to the next request.
@Injectable()
export class DataHubAccessService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  isSuperAdmin(caller: DataHubCaller): boolean {
    return caller.type === (UserType.SUPER_ADMIN as string);
  }

  // Role codes are keyed by users.id. An admin-client token carries an admins.id, which can equal an
  // unrelated user's id, so only user-client callers are given codes (super_admin is handled first).
  private async codesOf(caller: DataHubCaller): Promise<Set<string>> {
    if (caller.client !== (USER_CLIENT.USER as string)) return new Set();
    return this.permissionCache.getPermissions(caller.id);
  }

  async hasCode(caller: DataHubCaller, code: DataHubPermissionCode): Promise<boolean> {
    if (this.isSuperAdmin(caller)) return true;
    return (await this.codesOf(caller)).has(code);
  }

  assertSuperAdmin(caller: DataHubCaller): void {
    if (!this.isSuperAdmin(caller)) throw new ForbiddenException('SUPER_ADMIN_ONLY');
  }

  async myPermissions(caller: DataHubCaller): Promise<DataHubMyPermissions> {
    const all = this.isSuperAdmin(caller);
    const codes = all ? new Set<string>() : await this.codesOf(caller);
    const has = (code: DataHubPermissionCode) => all || codes.has(code);
    return {
      is_super_admin: all,
      consumer: { create: has(DH_PERMISSIONS.CONSUMER_CREATE), update: has(DH_PERMISSIONS.CONSUMER_UPDATE) },
      logical_term: {
        create: has(DH_PERMISSIONS.LOGICAL_TERM_CREATE),
        update: has(DH_PERMISSIONS.LOGICAL_TERM_UPDATE),
      },
      data_service: {
        create: has(DH_PERMISSIONS.DATA_SERVICE_CREATE),
        update: has(DH_PERMISSIONS.DATA_SERVICE_UPDATE),
      },
      department: {
        view: has(DH_PERMISSIONS.DEPARTMENT_VIEW),
        create: has(DH_PERMISSIONS.DEPARTMENT_CREATE),
        update: has(DH_PERMISSIONS.DEPARTMENT_UPDATE),
        delete: has(DH_PERMISSIONS.DEPARTMENT_DELETE),
      },
    };
  }

  // Data-service rights of any user id (users table), as the guard would see them; used to annotate members.
  async dataServiceRights(userId: number): Promise<{ can_create: boolean; can_update: boolean }> {
    const codes = await this.permissionCache.getPermissions(userId);
    return {
      can_create: codes.has(DH_PERMISSIONS.DATA_SERVICE_CREATE),
      can_update: codes.has(DH_PERMISSIONS.DATA_SERVICE_UPDATE),
    };
  }

  // Live departments the user is a member of.
  async memberDepartmentIds(userId: number, runner: DataSource | EntityManager = this.dataSource): Promise<number[]> {
    const rows: Array<{ department_id: number }> = await runner.query(
      `SELECT m.department_id FROM data_hub_department_members m
       JOIN data_hub_departments d ON d.id = m.department_id AND ${liveSql('d')}
       WHERE m.user_id = $1 ORDER BY m.department_id`,
      [userId],
    );
    return rows.map((r) => Number(r.department_id));
  }

  // Departments whose source tables the caller may pick on the data-service form: every department they are a
  // member of; null = every department (super_admin).
  async sourceTableDepartmentIds(
    caller: DataHubCaller,
    runner: DataSource | EntityManager = this.dataSource,
  ): Promise<number[] | null> {
    return this.isSuperAdmin(caller) ? null : this.memberDepartmentIds(caller.id, runner);
  }

  // Departments the caller may create in / update services of: member ∧ holds the action's code.
  // null means "every department" (super_admin).
  async writableDepartmentIds(caller: DataHubCaller, action: DataServiceWriteAction): Promise<number[] | null> {
    if (this.isSuperAdmin(caller)) return null;
    if (!(await this.hasCode(caller, WRITE_CODE[action]))) return [];
    return this.memberDepartmentIds(caller.id);
  }

  // Every given department must be one the caller is a member of (super_admin passes).
  // Runs inside the write transaction. The department rows are locked FOR SHARE first (for every caller) so a
  // concurrent department delete, which locks FOR UPDATE, cannot slip between this check and the write.
  // A missing department (null) belongs to nobody, so only super_admin may write such a service.
  async assertDepartmentWrite(
    caller: DataHubCaller,
    departmentIds: Array<number | null | undefined>,
    manager: EntityManager,
  ): Promise<void> {
    const ids = [...new Set(departmentIds.filter((x): x is number => typeof x === 'number'))];
    if (ids.length > 0) {
      await manager.query(
        `SELECT d.id FROM data_hub_departments d WHERE d.id = ANY($1) AND ${liveSql('d')} ORDER BY d.id FOR SHARE`,
        [ids],
      );
    }
    if (this.isSuperAdmin(caller)) return;
    if (ids.length === 0 || departmentIds.some((x) => typeof x !== 'number')) {
      throw new ForbiddenException('DEPARTMENT_FORBIDDEN');
    }
    const mine = new Set(await this.memberDepartmentIds(caller.id, manager));
    if (ids.some((id) => !mine.has(id))) throw new ForbiddenException('DEPARTMENT_FORBIDDEN');
  }

  // Update right on one data service: holds the update code and belongs to the service's department.
  async canUpdateDataService(caller: DataHubCaller, departmentId: number | null): Promise<boolean> {
    if (this.isSuperAdmin(caller)) return true;
    if (departmentId === null || !(await this.hasCode(caller, DH_PERMISSIONS.DATA_SERVICE_UPDATE))) return false;
    return (await this.memberDepartmentIds(caller.id)).includes(Number(departmentId));
  }
}
