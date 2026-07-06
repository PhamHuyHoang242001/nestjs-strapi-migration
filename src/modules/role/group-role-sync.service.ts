import { PermissionCacheService } from '@common/authorization';
import { GroupRoleMapping } from '@modules/databases/group-role-mapping.entity';
import { Role, ROLE_PERMISSION } from '@modules/databases/role.entity';
import { UserRole } from '@modules/databases/user-role.entity';
import { User, UserType } from '@modules/databases/user.entity';
import { PermissionRepository } from '@modules/permission/repository/permission.repository';
import { UserRepository } from '@modules/users/repository/users.repository';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { GROUP_ROLE_EMAIL_DOMAIN, GROUP_ROLE_PERMISSION_CODES } from './constants/group-role-sync.constants';
import { RoleRepository } from './repository/role.repository';

export interface RoleSyncResult {
  group_role: string;
  roleId: number;
  created: boolean;
  usersAdded: number;
  usersSkippedExisting: number;
  usersNotFound: string[];
}

export interface GroupRoleSyncReport {
  summary: { rolesCreated: number; rolesUpdated: number; usersAssigned: number; usersSkippedExisting: number };
  missingPermissionCodes: string[];
  roles: RoleSyncResult[];
  errors: Array<{ group_role: string; error: string }>;
}

/**
 * Bulk-syncs roles + user assignments from the group_role_mappings source table.
 * Rows are grouped by group_role → one role each. Fixed permission set is attached
 * (add-only for existing roles). Missing users / permission codes are skipped and reported.
 * Best-effort: no global transaction, so a bad row never blocks the rest.
 */
@Injectable()
export class GroupRoleSyncService {
  constructor(
    private readonly roleRepository: RoleRepository,
    private readonly userRepository: UserRepository,
    private readonly permissionRepository: PermissionRepository,
    private readonly connection: DataSource,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  async syncGroupRoles(caller: User): Promise<GroupRoleSyncReport> {
    if (caller?.type !== UserType.SUPER_ADMIN) {
      throw new ForbiddenException('Only super_admin can sync group roles');
    }

    const { permIds, missingPermissionCodes } = await this.resolvePermissions();
    const groups = await this.loadGroups();

    const report: GroupRoleSyncReport = {
      summary: { rolesCreated: 0, rolesUpdated: 0, usersAssigned: 0, usersSkippedExisting: 0 },
      missingPermissionCodes,
      roles: [],
      errors: [],
    };

    for (const [groupRole, emailUsers] of groups) {
      // Best-effort: an unexpected error on one group is recorded and never aborts the rest.
      try {
        const result = await this.syncOneGroup(groupRole, emailUsers, permIds, caller.id);
        report.roles.push(result);
        if (result.created) report.summary.rolesCreated++;
        else report.summary.rolesUpdated++;
        report.summary.usersAssigned += result.usersAdded;
        report.summary.usersSkippedExisting += result.usersSkippedExisting;
      } catch (err) {
        report.errors.push({ group_role: groupRole, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return report;
  }

  // Resolve the fixed permission codes → ids; report codes with no matching permission row.
  private async resolvePermissions(): Promise<{ permIds: number[]; missingPermissionCodes: string[] }> {
    const codes = GROUP_ROLE_PERMISSION_CODES;
    if (!codes.length) return { permIds: [], missingPermissionCodes: [] };
    const perms = await this.permissionRepository.find({ where: { code: In(codes) } });
    const foundCodes = new Set(perms.map((p) => p.code));
    return {
      permIds: perms.map((p) => p.id),
      missingPermissionCodes: codes.filter((c) => !foundCodes.has(c)),
    };
  }

  // Read all live mappings, collapse into group_role → set of email_user.
  private async loadGroups(): Promise<Map<string, Set<string>>> {
    const rows = await this.connection.getRepository(GroupRoleMapping).find();
    const groups = new Map<string, Set<string>>();
    for (const row of rows) {
      if (row.is_deleted || !row.group_role || !row.email_user) continue;
      if (!groups.has(row.group_role)) groups.set(row.group_role, new Set());
      groups.get(row.group_role)!.add(row.email_user);
    }
    return groups;
  }

  private async syncOneGroup(
    groupRole: string,
    emailUsers: Set<string>,
    permIds: number[],
    callerId: number,
  ): Promise<RoleSyncResult> {
    // Resolve users by derived email (lower(trim(email_user)) + domain).
    const emails = [...emailUsers].map((e) => e.trim().toLowerCase() + GROUP_ROLE_EMAIL_DOMAIN);
    const users = emails.length
      ? await this.userRepository.find({ where: { email: In(emails) }, select: ['id', 'email'] })
      : [];
    const foundEmails = new Set(users.map((u) => (u.email ?? '').toLowerCase()));
    const usersNotFound = emails.filter((e) => !foundEmails.has(e));
    const userIds = [...new Set(users.map((u) => u.id))]; // dedupe duplicate user rows per email

    // Find or create the role (name = group_role).
    let role = await this.roleRepository.findOneByCondition({ name: groupRole });
    const created = !role;
    if (!role) {
      role = await this.roleRepository.save({
        name: groupRole,
        created_by_id: callerId,
      } as Partial<Role>);
    }

    // Attach permissions via the explicit role_permissions join (add-only, raw insert).
    // Same path for new and existing roles now that permissions live on a join entity,
    // not a ManyToMany relation editable through Role.save.
    const added = await this.addPermissionsToRole(role.id, permIds);
    // New permissions on an EXISTING role change what its CURRENT users can do →
    // invalidate the whole role's cache (assignUsersToRole only covers newly-added users).
    // A freshly created role has no current users yet, so no role-wide invalidation needed.
    if (!created && added > 0) void this.permissionCache.invalidateByRole(role.id).catch(() => {});

    const { usersAdded, usersSkippedExisting } = await this.assignUsersToRole(role.id, userIds);
    return { group_role: groupRole, roleId: role.id, created, usersAdded, usersSkippedExisting, usersNotFound };
  }

  // Add-only permission sync for an existing role: never removes current permissions.
  // Returns the number of permission rows actually inserted.
  private async addPermissionsToRole(roleId: number, permIds: number[]): Promise<number> {
    if (!permIds.length) return 0;
    const existing: Array<{ permission_id: number }> = await this.connection.query(
      `SELECT permission_id FROM ${ROLE_PERMISSION} WHERE role_id = $1`,
      [roleId],
    );
    const existingIds = new Set(existing.map((r) => Number(r.permission_id)));
    const toInsert = permIds.filter((id) => !existingIds.has(id));
    if (!toInsert.length) return 0;
    const values = toInsert.map((_, i) => `($1, $${i + 2})`).join(', ');
    await this.connection.query(
      `INSERT INTO ${ROLE_PERMISSION} (role_id, permission_id) VALUES ${values} ON CONFLICT DO NOTHING`,
      [roleId, ...toInsert],
    );
    return toInsert.length;
  }

  // Insert only user links that don't already exist; invalidate permission cache for added users.
  private async assignUsersToRole(
    roleId: number,
    userIds: number[],
  ): Promise<{ usersAdded: number; usersSkippedExisting: number }> {
    if (!userIds.length) return { usersAdded: 0, usersSkippedExisting: 0 };
    const userRoleRepo = this.connection.getRepository(UserRole);
    const existing = await userRoleRepo.find({ where: { role_id: roleId, user_id: In(userIds) } });
    const existingIds = new Set(existing.map((ur) => ur.user_id));
    const toInsert = userIds
      .filter((uid) => !existingIds.has(uid))
      .map((uid) => userRoleRepo.create({ role_id: roleId, user_id: uid }));
    if (toInsert.length) await userRoleRepo.save(toInsert);
    toInsert.forEach((ur) => void this.permissionCache.invalidateUser(ur.user_id).catch(() => {}));
    return { usersAdded: toInsert.length, usersSkippedExisting: existingIds.size };
  }
}
