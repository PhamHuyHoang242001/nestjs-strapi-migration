import { PaginationParams } from '@common/decorators/pagination.decorator';
import { SortParams } from '@common/decorators/sort.decorator';
import { PermissionCacheService } from '@common/authorization';
import { StatusDto } from '@common/dto';
import { SortType, STATUS } from '@common/enums';
import { execQueryAll, execQueryPaignation } from '@common/utils';
import { MODEL_ROLE_NAME_EXISTS, MODEL_ROLE_USING_CAN_NOT_DELETE, NOT_FOUND } from '@constant/error-messages';
import { LIMIT_GET_ALL } from '@constant/index';
import { Permission } from '@modules/databases/permission.entity';
import { UserRole } from '@modules/databases/user-role.entity';
import { PermissionRepository } from '@modules/permission/repository/permission.repository';
import { UserRepository } from '@modules/users/repository/users.repository';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In, Not } from 'typeorm';
import { ROOT_OWNER_CONFIG, getNameColumn } from '@modules/data-access/constants/hierarchy-config';
import { ListRoleDto } from './dto';
import { AssignUsersRoleDto } from './dto/assign-users-role.dto';
import { CloneRoleDto } from './dto/clone-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { OwnerAssignmentDto } from './dto/owner-assignment.dto';
import { RoleRepository } from './repository/role.repository';
import { ChangeHistoryLogger } from '@modules/change-history/change-history-logger.service';
import { CHANGE_ACTION_TYPE, CHANGE_ENTITY_TYPE } from '@common/enums';
import { SearchRecordsDto } from '@modules/data-access/dto/search-records.dto';

@Injectable()
export class RoleService {
  constructor(
    private readonly roleRepository: RoleRepository,
    private readonly userRepository: UserRepository,
    private readonly permissionRepository: PermissionRepository,
    private readonly connection: DataSource,
    private readonly historyLogger: ChangeHistoryLogger,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  async validateForm(data: CreateRoleDto) {
    const { name } = data;
    const rs = await this.roleRepository.findOneByCondition({ name });
    if (rs) throw new BadRequestException(MODEL_ROLE_NAME_EXISTS);
    data.screen = data.screen.concat(data.sub_screen);
    return data;
  }
  async create(payload: CreateRoleDto, user_id: number) {
    const { permission, ...data } = payload;
    const rowCreated = await this.roleRepository.save({
      ...data,
      permissions: permission.map((id) => ({ id }) as Permission),
      user_id,
    });
    // Fetch permission codes for history log
    const permCodes = permission.length
      ? (await this.permissionRepository.findByIds(permission)).map((p) => p.code)
      : [];
    this.historyLogger
      .log({
        entity_type: CHANGE_ENTITY_TYPE.ROLE,
        action_type: CHANGE_ACTION_TYPE.CREATE,
        entity_id: String(rowCreated.id),
        entity_name: data.name,
        performed_by: 'system',
        old_value: null,
        new_value: { name: data.name, permissions: permCodes },
      })
      .catch(() => {});
    // Save owner assignments if provided
    if (payload.owner_assignments?.length) {
      await this.saveOwnerAssignments(rowCreated.id, payload.owner_assignments);
    }
    return { id: rowCreated.id };
  }

  // ── Owner Resources ───────────────────────────────────────────────

  async listOwnerResources(tableName: string, dto: SearchRecordsDto, pagination: PaginationParams) {
    if (!ROOT_OWNER_CONFIG[tableName]) {
      throw new BadRequestException('table_not_owner_root');
    }
    const nameCol = getNameColumn(tableName);
    const params: any[] = [];
    let whereClause = 'WHERE deleted_at IS NULL';

    if (dto.keyword) {
      params.push(`%${dto.keyword}%`);
      whereClause += ` AND (CAST(id AS TEXT) ILIKE $${params.length} OR CAST("${nameCol}" AS TEXT) ILIKE $${params.length})`;
    }

    const countResult = await this.connection.query(
      `SELECT COUNT(*)::int as total FROM "${tableName}" ${whereClause}`,
      params,
    );
    const total: number = countResult[0]?.total || 0;

    const offset = (pagination.page - 1) * pagination.limit;
    params.push(pagination.limit, offset);
    const data = await this.connection.query(
      `SELECT id, "${nameCol}" as display_name FROM "${tableName}" ${whereClause} ORDER BY id ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      data,
      meta: {
        totalItems: total,
        itemCount: data.length,
        itemsPerPage: pagination.limit,
        currentPage: pagination.page,
        totalPages: Math.ceil(total / pagination.limit) || 1,
      },
    };
  }

  async saveOwnerAssignments(roleId: number, assignments: OwnerAssignmentDto[]) {
    if (!assignments?.length) return;

    // Validate all resource_types exist in ROOT_OWNER_CONFIG
    const validTypes = new Set(Object.values(ROOT_OWNER_CONFIG).map((c) => c.resourceType));
    for (const a of assignments) {
      if (!validTypes.has(a.resource_type)) {
        throw new BadRequestException(`invalid_resource_type: ${a.resource_type}`);
      }
    }

    // Soft-delete existing owner assignments for this role
    await this.connection.query(
      'UPDATE resource_owners SET deleted_at = NOW() WHERE role_id = $1 AND deleted_at IS NULL',
      [roleId],
    );

    // Insert new assignments
    const rows: { resource_type: string; resource_id: number; role_id: number }[] = [];
    for (const a of assignments) {
      for (const rid of a.resource_ids) {
        rows.push({ resource_type: a.resource_type, resource_id: Number(rid), role_id: Number(roleId) });
      }
    }
    if (rows.length) {
      const values = rows.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
      const params = rows.flatMap((r) => [r.resource_type, r.resource_id, r.role_id]);
      await this.connection.query(
        `INSERT INTO resource_owners (resource_type, resource_id, role_id) VALUES ${values}`,
        params,
      );
    }
  }

  private async getOwnerAssignments(roleId: number): Promise<OwnerAssignmentDto[]> {
    const ownerRows: { resource_type: string; resource_id: number }[] = await this.connection.query(
      'SELECT resource_type, resource_id FROM resource_owners WHERE role_id = $1 AND deleted_at IS NULL ORDER BY resource_type, resource_id',
      [roleId],
    );
    const ownerMap = new Map<string, number[]>();
    for (const row of ownerRows) {
      const ids = ownerMap.get(row.resource_type) || [];
      ids.push(row.resource_id);
      ownerMap.set(row.resource_type, ids);
    }
    return Array.from(ownerMap.entries()).map(([resource_type, resource_ids]) => ({ resource_type, resource_ids }));
  }

  checkPermissionSelected(permission_selected: Permission[], permission: { id: number }) {
    if (permission_selected.find((u) => u.id == permission.id)) return true;
    return false;
  }
  async details(id: number) {
    const role = await this.roleRepository.findDetailRelationWithModule(id);
    // Group permissions by module for easier frontend consumption
    const permissions_by_module: Record<string, Permission[]> = {};
    if (role.permissions) {
      for (const perm of role.permissions) {
        const moduleKey = perm.module ? perm.module.name : 'uncategorized';
        if (!permissions_by_module[moduleKey]) permissions_by_module[moduleKey] = [];
        permissions_by_module[moduleKey].push(perm);
      }
    }
    const owner_assignments = await this.getOwnerAssignments(id);
    return { ...role, permissions_by_module, owner_assignments };
  }

  async clone(id: number, dto: CloneRoleDto, user_id: number) {
    // Find source role with permissions
    const sourceRole = await this.roleRepository.findOne({ where: { id }, relations: ['permissions'] });
    if (!sourceRole) throw new NotFoundException(NOT_FOUND);

    // Validate name uniqueness
    const existing = await this.roleRepository.findOneByCondition({ name: dto.name });
    if (existing) throw new BadRequestException(MODEL_ROLE_NAME_EXISTS);

    // Save new role with same permissions + new name/code
    const newRole = await this.roleRepository.save({
      name: dto.name,
      code: dto.code ?? null,
      description: sourceRole.description,
      permissions: sourceRole.permissions,
      user_id,
    });
    this.historyLogger
      .log({
        entity_type: CHANGE_ENTITY_TYPE.ROLE,
        action_type: CHANGE_ACTION_TYPE.CLONE,
        entity_id: String(newRole.id),
        entity_name: dto.name,
        performed_by: 'system',
        old_value: { source_role_id: id, source_role_name: sourceRole.name },
        new_value: {
          name: dto.name,
          code: dto.code ?? null,
          description: sourceRole.description,
          permissions: sourceRole.permissions.map((p) => p.code),
        },
      })
      .catch(() => {});
    return { id: newRole.id };
  }

  async getUsersInRole(roleId: number, search: string, paginationParams: PaginationParams) {
    const userRoleRepo = this.connection.getRepository(UserRole);
    const query = userRoleRepo
      .createQueryBuilder('ur')
      .innerJoinAndSelect('ur.user', 'user')
      .where('ur.role_id = :roleId', { roleId });

    if (search) {
      query.andWhere(
        '(user.full_name ILIKE :search OR user.email ILIKE :search OR user.username ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const { page, limit } = paginationParams;
    return execQueryPaignation(query, page, limit);
  }

  async assignUsers(roleId: number, dto: AssignUsersRoleDto) {
    const role = await this.roleRepository.findOneByIdValid(roleId);
    const userRoleRepo = this.connection.getRepository(UserRole);

    // Capture old user list before change
    const oldLinks = await userRoleRepo.findBy({ role_id: roleId });
    const oldUserIds = oldLinks.map((ur) => ur.user_id);
    const oldUsers = oldUserIds.length
      ? await this.userRepository.find({ where: { id: In(oldUserIds) }, select: ['id', 'username'] })
      : [];

    // Insert only non-existing ones
    const existing = await userRoleRepo.find({ where: { role_id: roleId, user_id: In(dto.user_ids) } });
    const existingUserIds = existing.map((ur) => ur.user_id);
    const toInsert = dto.user_ids
      .filter((uid) => !existingUserIds.includes(uid))
      .map((uid) => userRoleRepo.create({ role_id: roleId, user_id: uid }));
    if (toInsert.length) await userRoleRepo.save(toInsert);

    // Capture new user list after change
    const newLinks = await userRoleRepo.findBy({ role_id: roleId });
    const newUserIds = newLinks.map((ur) => ur.user_id);
    const newUsers = newUserIds.length
      ? await this.userRepository.find({ where: { id: In(newUserIds) }, select: ['id', 'username'] })
      : [];

    this.historyLogger
      .log({
        entity_type: CHANGE_ENTITY_TYPE.ROLE_USER,
        action_type: CHANGE_ACTION_TYPE.ASSIGN_USER,
        entity_id: String(roleId),
        entity_name: role.name,
        performed_by: 'system',
        old_value: { users: oldUsers.map((u) => u.username) },
        new_value: { users: newUsers.map((u) => u.username) },
      })
      .catch(() => {});

    toInsert.forEach((userRole) => {
      void this.permissionCache.invalidateUser(userRole.user_id).catch(() => {});
    });

    return { added: toInsert.length, total: dto.user_ids.length };
  }

  async removeUsers(roleId: number, dto: AssignUsersRoleDto) {
    const role = await this.roleRepository.findOneByIdValid(roleId);
    const userRoleRepo = this.connection.getRepository(UserRole);

    // Capture old user list before change
    const oldLinks = await userRoleRepo.findBy({ role_id: roleId });
    const oldUserIds = oldLinks.map((ur) => ur.user_id);
    const oldUsers = oldUserIds.length
      ? await this.userRepository.find({ where: { id: In(oldUserIds) }, select: ['id', 'username'] })
      : [];

    await userRoleRepo.delete({ role_id: roleId, user_id: In(dto.user_ids) });

    // Capture new user list after change
    const newLinks = await userRoleRepo.findBy({ role_id: roleId });
    const newUserIds = newLinks.map((ur) => ur.user_id);
    const newUsers = newUserIds.length
      ? await this.userRepository.find({ where: { id: In(newUserIds) }, select: ['id', 'username'] })
      : [];

    this.historyLogger
      .log({
        entity_type: CHANGE_ENTITY_TYPE.ROLE_USER,
        action_type: CHANGE_ACTION_TYPE.REMOVE_USER,
        entity_id: String(roleId),
        entity_name: role.name,
        performed_by: 'system',
        old_value: { users: oldUsers.map((u) => u.username) },
        new_value: { users: newUsers.map((u) => u.username) },
      })
      .catch(() => {});

    dto.user_ids.forEach((userId) => {
      void this.permissionCache.invalidateUser(userId).catch(() => {});
    });

    return { removed: dto.user_ids.length };
  }

  async validateFormUpdate(payload: UpdateRoleDto, id: number) {
    const { sub_screen, ...data } = payload;
    // Validate role exists
    const existing = await this.roleRepository.findOne({ where: { id } });
    if (!existing) throw new NotFoundException();
    // Check name uniqueness only if name is being changed
    if (data.name !== undefined) {
      const duplicate = await this.roleRepository.findOneByCondition({ id: Not(id), name: data.name });
      if (duplicate) throw new BadRequestException(MODEL_ROLE_NAME_EXISTS);
    }
    data.screen = (data.screen ?? []).concat(sub_screen ?? []);
    return data;
  }

  async update(id: number, payload: UpdateRoleDto) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { permission, permission_ids, user_ids, owner_assignments, screen: _screen, sub_screen: _sub_screen, ...data } = payload;

    // Capture old record with permissions before update for change history
    const oldRecord = await this.roleRepository.findOne({ where: { id }, relations: ['permissions'] });

    // permission_ids (new field) takes priority over permission (legacy CreateRoleDto field)
    const finalPermIds = permission_ids ?? (permission ? permission : undefined);
    const hasPermChange = finalPermIds !== undefined;
    const hasUserChange = user_ids !== undefined;
    const hasFieldChange = Object.keys(data).length > 0;
    const oldAssignedUserIds = hasUserChange
      ? (await this.connection.getRepository(UserRole).find({ where: { role_id: id }, select: ['user_id'] })).map(
          (ur) => ur.user_id,
        )
      : [];

    // Validate permission IDs if provided
    if (hasPermChange && finalPermIds.length > 0) {
      const validPerms = await this.permissionRepository.find({ where: { is_active: true }, select: ['id'] });
      const validIds = new Set(validPerms.map((p) => p.id));
      const invalidIds = finalPermIds.filter((pid) => !validIds.has(pid));
      if (invalidIds.length > 0) throw new BadRequestException(`Invalid permission IDs: ${invalidIds.join(', ')}`);
    }

    // Validate user IDs if provided
    if (hasUserChange && user_ids.length > 0) {
      const validUsers = await this.userRepository.find({ where: { id: In(user_ids) }, select: ['id'] });
      if (validUsers.length !== user_ids.length) {
        const validSet = new Set(validUsers.map((u) => u.id));
        const invalidIds = user_ids.filter((uid) => !validSet.has(uid));
        throw new BadRequestException(`Invalid user IDs: ${invalidIds.join(', ')}`);
      }
    }

    // Single transaction for all changes
    await this.connection.transaction(async (manager) => {
      // 1. Update role fields (name, description, status, etc.)
      if (hasFieldChange) {
        await manager.save(this.roleRepository.target, { id, ...data });
      }

      // 2. Replace permissions if provided
      if (hasPermChange) {
        await manager.createQueryBuilder().delete().from('roles_permissions').where('role_id = :id', { id }).execute();
        if (finalPermIds.length > 0) {
          await manager
            .createQueryBuilder()
            .insert()
            .into('roles_permissions')
            .values(finalPermIds.map((pid) => ({ role_id: id, permission_id: pid })))
            .execute();
        }
      }

      // 3. Replace user assignments if provided
      if (hasUserChange) {
        await manager.createQueryBuilder().delete().from('user_roles').where('role_id = :id', { id }).execute();
        if (user_ids.length > 0) {
          await manager
            .createQueryBuilder()
            .insert()
            .into('user_roles')
            .values(user_ids.map((uid) => ({ role_id: id, user_id: uid })))
            .execute();
        }
      }
    });

    // Save owner assignments if provided
    if (owner_assignments !== undefined) {
      await this.saveOwnerAssignments(id, owner_assignments);
    }

    // Build history log with permission codes instead of IDs
    const logNewValue: Record<string, any> = { ...data };
    if (user_ids !== undefined) {
      const userEntities = user_ids.length
        ? await this.userRepository.find({ where: { id: In(user_ids) }, select: ['id', 'username'] })
        : [];
      logNewValue.users = userEntities.map((u) => u.username);
    }
    if (finalPermIds !== undefined) {
      const permEntities = finalPermIds.length ? await this.permissionRepository.findByIds(finalPermIds) : [];
      logNewValue.permissions = permEntities.map((p) => p.code);
    }
    this.historyLogger
      .log({
        entity_type: CHANGE_ENTITY_TYPE.ROLE,
        action_type: CHANGE_ACTION_TYPE.UPDATE,
        entity_id: String(id),
        entity_name: oldRecord?.name ?? String(id),
        performed_by: 'system',
        old_value: oldRecord
          ? {
              name: oldRecord.name,
              code: oldRecord.code,
              description: oldRecord.description,
              status: oldRecord.status,
              permissions: (oldRecord.permissions || []).map((p) => p.code),
            }
          : null,
        new_value: logNewValue,
      })
      .catch(() => {});

    if (hasPermChange) this.permissionCache.invalidateByRole(id).catch(() => {});
    if (user_ids !== undefined) {
      const affectedUserIds = new Set([...oldAssignedUserIds, ...user_ids]);
      affectedUserIds.forEach((userId) => {
        void this.permissionCache.invalidateUser(userId).catch(() => {});
      });
    }

    return { id };
  }

  async setStatus(id: number, data: StatusDto) {
    const { status } = data;
    const rs = await this.roleRepository.findOneByIdValid(id);
    if (rs.status != status) {
      await this.roleRepository.updateOne({ id: rs.id }, { status });
      this.historyLogger
        .log({
          entity_type: CHANGE_ENTITY_TYPE.ROLE,
          action_type: status === STATUS.ACTIVE ? CHANGE_ACTION_TYPE.ACTIVATE : CHANGE_ACTION_TYPE.DEACTIVATE,
          entity_id: String(id),
          entity_name: rs.name,
          performed_by: 'system',
          old_value: { is_active: rs.status },
          new_value: { is_active: status },
        })
        .catch(() => {});
      this.permissionCache.invalidateByRole(id).catch(() => {});
    }
    return { id, status };
  }
  async delete(id: number) {
    const roleToDelete = await this.roleRepository.findOneByIdValid(id);
    const rs = await this.userRepository.findOneByCondition({ role_id: id });
    if (rs) throw new BadRequestException(MODEL_ROLE_USING_CAN_NOT_DELETE);
    await this.roleRepository.softDelete({ id });
    this.historyLogger
      .log({
        entity_type: CHANGE_ENTITY_TYPE.ROLE,
        action_type: CHANGE_ACTION_TYPE.DELETE,
        entity_id: String(id),
        entity_name: roleToDelete.name,
        performed_by: 'system',
        old_value: { name: roleToDelete.name, code: roleToDelete.code, description: roleToDelete.description },
        new_value: null,
      })
      .catch(() => {});
    this.permissionCache.invalidateByRole(id).catch(() => {});
    return { id };
  }

  async getAll() {
    let result = [];
    const options = { skip: 0, limit: LIMIT_GET_ALL, sort: { id: SortType.DESC } };
    const pipeline = {
      status: STATUS.ACTIVE,
    };

    while (true) {
      const data = await this.roleRepository.findListByCondition(pipeline, options.skip, options.limit, options.sort);
      if (!data?.length) break;
      result = result.concat(data);
      if (data?.length < options.limit) break;
      options.skip += options.limit;
    }

    return { data: result };
  }

  async search(payload: ListRoleDto, sortParam: SortParams, paginationParams: PaginationParams) {
    const queryBuilder = this.roleRepository.buildQueryBuilderRole(payload, sortParam);
    const { page, limit } = paginationParams;
    if (limit === -1) return execQueryAll(queryBuilder);
    return execQueryPaignation(queryBuilder, page, limit);
  }
}
