import { SortParams } from '@common/decorators/sort.decorator';
import { PaginationParams } from '@common/decorators/pagination.decorator';
import { PermissionCacheService } from '@common/authorization';
import { CHANGE_ACTION_TYPE, CHANGE_ENTITY_TYPE, SCOPE_TYPE } from '@common/enums';
import { NOT_FOUND } from '@constant/error-messages';
import { DataAccess, RoleDataAccess, UserDataAccess } from '@modules/databases/data-access.entity';
import { Module as ModuleEntity } from '@modules/databases/module.entity';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ALLOWED_TABLES, getNameColumn } from './constants/hierarchy-config';
import { CreateDataAccessDto } from './dto/create-data-access.dto';
import { SearchDataAccessDto } from './dto/search-data-access.dto';
import { SearchRecordsDto } from './dto/search-records.dto';
import { UpdateDataAccessDto } from './dto/update-data-access.dto';
import { HierarchyValidationService } from './hierarchy-validation.service';
import { DataAccessRepository } from './repository/data-access.repository';
import { ChangeHistoryLogger } from '@modules/change-history/change-history-logger.service';

@Injectable()
export class DataAccessService {
  constructor(
    private readonly dataAccessRepository: DataAccessRepository,
    private readonly connection: DataSource,
    private readonly hierarchyValidation: HierarchyValidationService,
    private readonly historyLogger: ChangeHistoryLogger,
    private readonly permissionCache: PermissionCacheService,
    @InjectRepository(ModuleEntity)
    private readonly moduleRepo: Repository<ModuleEntity>,
    @InjectRepository(RoleDataAccess)
    private readonly roleDataAccessRepo: Repository<RoleDataAccess>,
    @InjectRepository(UserDataAccess)
    private readonly userDataAccessRepo: Repository<UserDataAccess>,
  ) {}

  // ── Junction helpers ────────────────────────────────────────────────────────

  /** Insert junction rows for roles/users/permissions linked to a data_access record */
  private async insertJunctions(
    dataAccessId: number,
    roleIds?: number[],
    userPermissions?: { user_id: number; permission_ids: number[] }[],
  ) {
    if (roleIds?.length) {
      await this.roleDataAccessRepo.insert(roleIds.map((role_id) => ({ role_id, data_access_id: dataAccessId })));
    }
    if (userPermissions?.length) {
      const rows = userPermissions.flatMap((userPermission) =>
        userPermission.permission_ids.map((permission_id) => ({
          user_id: userPermission.user_id,
          data_access_id: dataAccessId,
          permission_id,
        })),
      );
      if (rows.length) await this.userDataAccessRepo.insert(rows);
    }
  }

  // ── DataAccess CRUD ─────────────────────────────────────────────────────────

  /**
   * List data access rules flattened 1-1 (1 subject per row).
   * Each rule with N roles + M users produces N+M rows.
   * Pagination applies to the flattened result.
   */
  async list(dto: SearchDataAccessDto, sortParams: SortParams, pagination: PaginationParams) {
    const params: any[] = [];
    let whereClause = 'WHERE da.deleted_at IS NULL';

    if (dto.module_id) {
      params.push(dto.module_id);
      whereClause += ` AND da.module_id = $${params.length}`;
    }
    if (dto.scope_type) {
      params.push(dto.scope_type);
      whereClause += ` AND da.scope_type = $${params.length}`;
    }
    if (dto.subject_type === 'role') {
      whereClause += ` AND s.subject_type = 'role'`;
    } else if (dto.subject_type === 'user') {
      whereClause += ` AND s.subject_type = 'user'`;
    }
    if (dto.role_id) {
      params.push(dto.role_id);
      whereClause += ` AND s.subject_type = 'role' AND s.subject_id = $${params.length}`;
    }
    if (dto.user_id) {
      params.push(dto.user_id);
      whereClause += ` AND s.subject_type = 'user' AND s.subject_id = $${params.length}`;
    }
    if (dto.search) {
      params.push(`%${dto.search}%`);
      whereClause += ` AND (CAST(da.data_id AS TEXT) ILIKE $${params.length} OR s.subject_name ILIKE $${params.length})`;
    }

    // Flatten: UNION of roles and users per rule, join modules for table_name & path
    // User branch aggregates permissions per (rule_id, user) to avoid duplicate rows
    const flattenCTE = `
      WITH flattened AS (
        SELECT da.id as rule_id, da.data_id, da.module_id,
               m.table_name, m.path as module_path, m.name as module_name,
               da.scope_type, da.start_date, da.end_date, da.created_at,
               'role' as subject_type, r.id as subject_id, r.name as subject_name,
               NULL::jsonb as permissions
        FROM data_access da
        JOIN modules m ON m.id = da.module_id
        JOIN data_access_roles dar ON dar.data_access_id = da.id AND dar.deleted_at IS NULL
        JOIN role r ON r.id = dar.role_id
        WHERE da.deleted_at IS NULL
        UNION ALL
        SELECT da.id as rule_id, da.data_id, da.module_id,
               m.table_name, m.path as module_path, m.name as module_name,
               da.scope_type, da.start_date, da.end_date, da.created_at,
               'user' as subject_type, u.id as subject_id,
               COALESCE(u.full_name, u.username) as subject_name,
               json_agg(json_build_object('id', p.id, 'name', p.name))::jsonb as permissions
        FROM data_access da
        JOIN modules m ON m.id = da.module_id
        JOIN data_access_users dau ON dau.data_access_id = da.id AND dau.deleted_at IS NULL
        JOIN users u ON u.id = dau.user_id
        JOIN permission p ON p.id = dau.permission_id AND p.deleted_at IS NULL
        WHERE da.deleted_at IS NULL
        GROUP BY da.id, da.data_id, da.module_id, m.table_name, m.path, m.name,
                 da.scope_type, da.start_date, da.end_date, da.created_at, u.id, u.full_name, u.username
      )`;

    const sortField = sortParams?.sort_field || 'created_at';
    const sortOrder = sortParams?.sort_order || 'DESC';
    const allowedSortFields = ['created_at', 'data_id', 'table_name', 'scope_type', 'module_id'];
    const safeSortField = allowedSortFields.includes(sortField) ? sortField : 'created_at';
    const safeSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const flatWhere = whereClause.replace(/da\./g, 's.').replace('WHERE s.deleted_at IS NULL', 'WHERE 1=1');

    // Count
    const countQuery = `${flattenCTE} SELECT COUNT(*)::int as total FROM flattened s ${flatWhere}`;
    const countResult = await this.connection.query(countQuery, params);
    const total: number = countResult[0]?.total || 0;

    // Paginated data
    const { page, limit } = pagination;
    const offset = (page - 1) * limit;
    const dataParams = [...params, limit, offset];
    const dataQuery = `${flattenCTE}
      SELECT s.rule_id, s.data_id, s.module_id, s.table_name, s.module_path, s.module_name,
             s.scope_type, s.start_date, s.end_date, s.created_at,
             s.subject_type, s.subject_id, s.subject_name, s.permissions
      FROM flattened s
      ${flatWhere}
      ORDER BY s.${safeSortField} ${safeSortOrder}, s.rule_id DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;

    const data = await this.connection.query(dataQuery, dataParams);

    return {
      data,
      meta: {
        totalItems: total,
        itemCount: data.length,
        itemsPerPage: limit,
        currentPage: page,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async details(id: number) {
    const record = await this.dataAccessRepository.findOne({
      where: { id },
      relations: [
        'module',
        'role_data_access',
        'role_data_access.role',
        'user_data_access',
        'user_data_access.user',
        'user_data_access.permission',
      ],
    });
    if (!record) throw new NotFoundException(NOT_FOUND);

    // Fetch the referenced record info from the target table
    const tableName = record.module?.table_name;
    let record_info: { id: number; display_name: string } | null = null;
    if (tableName && ALLOWED_TABLES.has(tableName)) {
      const nameCol = getNameColumn(tableName);
      const rows: { id: number; display_name: string }[] = await this.connection.query(
        `SELECT id, "${nameCol}" as display_name FROM "${tableName}" WHERE id = $1 AND deleted_at IS NULL`,
        [record.data_id],
      );
      if (rows.length > 0) {
        record_info = { id: rows[0].id, display_name: rows[0].display_name || `ID: ${rows[0].id}` };
      }
    }

    return { ...record, record_info };
  }

  /** Resolve module by ID and validate its table_name is allowed */
  private async resolveModule(moduleId: number): Promise<ModuleEntity> {
    const mod = await this.moduleRepo.findOne({ where: { id: moduleId } });
    if (!mod) throw new NotFoundException('module_not_found');
    if (!mod.table_name || !ALLOWED_TABLES.has(mod.table_name)) {
      throw new BadRequestException('table_not_allowed');
    }
    return mod;
  }

  async create(dto: CreateDataAccessDto, performedBy = 'system') {
    if (!dto.role_ids?.length && !dto.user_permissions?.length) {
      throw new BadRequestException('data_access_must_have_role_or_user');
    }

    // Validate no duplicate user_id in user_permissions
    if (dto.user_permissions?.length) {
      const userIdSet = new Set(dto.user_permissions.map((up) => up.user_id));
      if (userIdSet.size !== dto.user_permissions.length) {
        throw new BadRequestException('duplicate_user_id_in_user_permissions');
      }
    }

    const mod = await this.resolveModule(dto.module_id);
    const userIds = dto.user_permissions?.map((userPermission) => userPermission.user_id) || [];

    // Hierarchy validation — only for allow rules
    if (dto.scope_type === SCOPE_TYPE.ALLOW) {
      await this.hierarchyValidation.enforce(dto.data_ids, mod.table_name, userIds, dto.role_ids || []);
    }

    const savedIds: number[] = [];

    // Wrap the entire creation loop in a transaction
    await this.connection.transaction(async (manager) => {
      for (const dataId of dto.data_ids) {
        const record = manager.create(DataAccess, {
          data_id: dataId,
          module_id: dto.module_id,
          scope_type: dto.scope_type,
          start_date: dto.start_date,
          end_date: dto.end_date,
        });
        const saved = await manager.save(record);
        savedIds.push(saved.id);

        // Insert role junctions
        if (dto.role_ids?.length) {
          await manager.insert(
            RoleDataAccess,
            dto.role_ids.map((role_id) => ({ role_id, data_access_id: saved.id })),
          );
        }

        // Insert user-permission junctions
        if (dto.user_permissions?.length) {
          const rows = dto.user_permissions.flatMap((userPermission) =>
            userPermission.permission_ids.map((permission_id) => ({
              user_id: userPermission.user_id,
              data_access_id: saved.id,
              permission_id,
            })),
          );
          if (rows.length) await manager.insert(UserDataAccess, rows);
        }
      }
    });

    this.historyLogger
      .log({
        entity_type: CHANGE_ENTITY_TYPE.DATA_ACCESS,
        action_type: CHANGE_ACTION_TYPE.CREATE,
        entity_id: savedIds.join(','),
        entity_name: mod.table_name,
        performed_by: performedBy,
        old_value: null,
        new_value: {
          module_id: dto.module_id,
          table_name: mod.table_name,
          data_ids: dto.data_ids,
          scope_type: dto.scope_type,
          start_date: dto.start_date || null,
          end_date: dto.end_date || null,
          roles: dto.role_ids?.length
            ? (await this.connection.query('SELECT name FROM role WHERE id = ANY($1)', [dto.role_ids])).map(
                (r: any) => r.name,
              )
            : [],
          user_permissions: dto.user_permissions || [],
        },
      })
      .catch(() => {});

    this.permissionCache.invalidateByTable(mod.table_name).catch(() => {});

    // Invalidate permission cache for affected users
    const affectedUserIds = dto.user_permissions?.map((up) => up.user_id) || [];
    for (const uid of affectedUserIds) {
      this.permissionCache.invalidateUser(uid).catch(() => {});
    }

    return { ids: savedIds };
  }

  /**
   * Update a data access rule by id.
   * Updates scope/dates and replaces junction links.
   */
  async update(id: number, dto: UpdateDataAccessDto, performedBy = 'system') {
    // Validate no duplicate user_id in user_permissions
    if (dto.user_permissions?.length) {
      const userIdSet = new Set(dto.user_permissions.map((up) => up.user_id));
      if (userIdSet.size !== dto.user_permissions.length) {
        throw new BadRequestException('duplicate_user_id_in_user_permissions');
      }
    }

    const old = await this.dataAccessRepository.findOne({
      where: { id },
      relations: [
        'module',
        'role_data_access',
        'role_data_access.role',
        'user_data_access',
        'user_data_access.user',
        'user_data_access.permission',
      ],
    });
    if (!old) throw new NotFoundException(NOT_FOUND);

    const tableName = old.module?.table_name;

    // Capture old values for history
    const oldValue = {
      module_id: old.module_id,
      table_name: tableName,
      data_id: old.data_id,
      scope_type: old.scope_type,
      roles: old.role_data_access.map((rda) => rda.role?.name),
      user_permissions: old.user_data_access.map((uda) => ({
        user_id: uda.user_id,
        username: uda.user?.username,
        permission_id: uda.permission_id,
        permission_name: uda.permission?.name,
      })),
      start_date: old.start_date,
      end_date: old.end_date,
    };

    // Hierarchy validation for allow rules
    const newScopeType = dto.scope_type ?? old.scope_type;
    if (newScopeType === SCOPE_TYPE.ALLOW && tableName) {
      const userIds = dto.user_permissions
        ? dto.user_permissions.map((userPermission) => userPermission.user_id)
        : old.user_data_access.map((uda) => uda.user_id);
      const roleIds = dto.role_ids ?? old.role_data_access.map((rda) => rda.role_id);
      await this.hierarchyValidation.enforce([old.data_id], tableName, userIds, roleIds);
    }

    await this.connection.transaction(async (manager) => {
      // Update data_access fields
      old.scope_type = dto.scope_type ?? old.scope_type;
      old.start_date = dto.start_date ?? old.start_date;
      old.end_date = dto.end_date ?? old.end_date;
      await manager.save(old);

      // Replace role junctions if provided
      if (dto.role_ids) {
        await manager.delete(RoleDataAccess, { data_access_id: id });
        if (dto.role_ids.length) {
          await manager.insert(
            RoleDataAccess,
            dto.role_ids.map((role_id) => ({ role_id, data_access_id: id })),
          );
        }
      }

      // Replace user-permission junctions if provided
      if (dto.user_permissions) {
        await manager.delete(UserDataAccess, { data_access_id: id });
        const rows = dto.user_permissions.flatMap((userPermission) =>
          userPermission.permission_ids.map((permission_id) => ({
            user_id: userPermission.user_id,
            data_access_id: id,
            permission_id,
          })),
        );
        if (rows.length) {
          await manager.insert(UserDataAccess, rows);
        }
      }
    });

    // Resolve new role/user names for history
    const newRoleNames = dto.role_ids?.length
      ? (await this.connection.query('SELECT name FROM role WHERE id = ANY($1)', [dto.role_ids])).map(
          (r: any) => r.name,
        )
      : oldValue.roles;
    const newUserPermissions = dto.user_permissions ?? oldValue.user_permissions;

    this.historyLogger
      .log({
        entity_type: CHANGE_ENTITY_TYPE.DATA_ACCESS,
        action_type: CHANGE_ACTION_TYPE.UPDATE,
        entity_id: String(id),
        entity_name: tableName || String(old.module_id),
        performed_by: performedBy,
        old_value: oldValue,
        new_value: {
          scope_type: dto.scope_type ?? old.scope_type,
          roles: newRoleNames,
          user_permissions: newUserPermissions,
          start_date: dto.start_date ?? old.start_date,
          end_date: dto.end_date ?? old.end_date,
        },
      })
      .catch(() => {});

    if (tableName) {
      this.permissionCache.invalidateByTable(tableName).catch(() => {});
    }

    // Invalidate permission cache for both old and new affected users
    const oldUserIds = old.user_data_access.map((uda) => uda.user_id);
    const newUserIds = dto.user_permissions?.map((up) => up.user_id) || [];
    const allAffectedUserIds = new Set([...oldUserIds, ...newUserIds]);
    for (const uid of allAffectedUserIds) {
      this.permissionCache.invalidateUser(uid).catch(() => {});
    }

    return { id };
  }

  async delete(id: number, performedBy = 'system') {
    const record = await this.dataAccessRepository.findOne({
      where: { id },
      relations: ['module', 'role_data_access', 'role_data_access.role', 'user_data_access', 'user_data_access.user'],
    });
    if (!record) throw new NotFoundException(NOT_FOUND);

    const tableName = record.module?.table_name;

    await this.connection.transaction(async (manager) => {
      // Soft-delete junction records
      await manager.softDelete(RoleDataAccess, { data_access_id: id });
      await manager.softDelete(UserDataAccess, { data_access_id: id });
      // Soft-delete the rule itself
      await manager.softDelete(DataAccess, { id });
    });

    this.historyLogger
      .log({
        entity_type: CHANGE_ENTITY_TYPE.DATA_ACCESS,
        action_type: CHANGE_ACTION_TYPE.DELETE,
        entity_id: String(id),
        entity_name: tableName || String(record.module_id),
        performed_by: performedBy,
        old_value: {
          module_id: record.module_id,
          table_name: tableName,
          data_id: record.data_id,
          scope_type: record.scope_type,
          roles: record.role_data_access.map((rda) => rda.role?.name),
          users: record.user_data_access.map((uda) => uda.user?.email || uda.user?.username),
        },
        new_value: null,
      })
      .catch(() => {});

    if (tableName) {
      this.permissionCache.invalidateByTable(tableName).catch(() => {});
    }

    // Invalidate permission cache for affected users
    for (const uda of record.user_data_access) {
      this.permissionCache.invalidateUser(uda.user_id).catch(() => {});
    }

    return { id };
  }

  /**
   * Remove a specific subject link from a rule.
   * Soft-deletes the junction row.
   * If no subjects remain after removal, soft-deletes the entire rule.
   */
  async removeLink(ruleId: number, subjectType: 'role' | 'user', subjectId: number, performedBy = 'system') {
    const record = await this.dataAccessRepository.findOne({
      where: { id: ruleId },
      relations: [
        'module',
        'role_data_access',
        'role_data_access.role',
        'user_data_access',
        'user_data_access.user',
        'user_data_access.permission',
      ],
    });
    if (!record) throw new NotFoundException(NOT_FOUND);

    const tableName = record.module?.table_name;

    // Soft-delete the specific junction row
    if (subjectType === 'role') {
      await this.roleDataAccessRepo.softDelete({ data_access_id: ruleId, role_id: subjectId });
    } else {
      await this.userDataAccessRepo.softDelete({ data_access_id: ruleId, user_id: subjectId });
    }

    // Check if any subjects remain — use distinct user_ids (multiple rows per user due to permission_id)
    const remainingRoles = record.role_data_access.filter(
      (rda) => !(subjectType === 'role' && rda.role_id === subjectId),
    ).length;
    const remainingUserIds = new Set(
      record.user_data_access
        .filter((uda) => !(subjectType === 'user' && uda.user_id === subjectId))
        .map((uda) => uda.user_id),
    );
    const remainingUsers = remainingUserIds.size;

    if (remainingRoles === 0 && remainingUsers === 0) {
      await this.dataAccessRepository.softDelete({ id: ruleId });
    }

    this.historyLogger
      .log({
        entity_type: CHANGE_ENTITY_TYPE.DATA_ACCESS,
        action_type: CHANGE_ACTION_TYPE.DELETE,
        entity_id: String(ruleId),
        entity_name: tableName || String(record.module_id),
        performed_by: performedBy,
        old_value: {
          module_id: record.module_id,
          table_name: tableName,
          data_id: record.data_id,
          removed_subject_type: subjectType,
          removed_subject_name:
            subjectType === 'role'
              ? record.role_data_access.find((rda) => rda.role_id === subjectId)?.role?.name || String(subjectId)
              : record.user_data_access.find((uda) => uda.user_id === subjectId)?.user?.email ||
                record.user_data_access.find((uda) => uda.user_id === subjectId)?.user?.username ||
                String(subjectId),
          // Include permission details for user removals
          removed_permissions:
            subjectType === 'user'
              ? record.user_data_access
                  .filter((uda) => uda.user_id === subjectId)
                  .map((uda) => ({ permission_id: uda.permission_id, permission_name: uda.permission?.name }))
              : undefined,
        },
        new_value: null,
      })
      .catch(() => {});

    if (tableName) {
      this.permissionCache.invalidateByTable(tableName).catch(() => {});
    }

    // Invalidate permission cache for the removed subject if it's a user
    if (subjectType === 'user') {
      this.permissionCache.invalidateUser(subjectId).catch(() => {});
    }

    return { rule_id: ruleId, removed: { subject_type: subjectType, subject_id: subjectId } };
  }

  async getByUser(userId: number) {
    return this.dataAccessRepository
      .createQueryBuilder('da')
      .leftJoinAndSelect('da.module', 'module')
      .leftJoinAndSelect('da.user_data_access', 'uda')
      .leftJoinAndSelect('uda.user', 'user')
      .leftJoinAndSelect('uda.permission', 'permission')
      .leftJoinAndSelect('da.role_data_access', 'rda')
      .leftJoinAndSelect('rda.role', 'role')
      .where('uda.user_id = :userId', { userId })
      .andWhere('uda.deleted_at IS NULL')
      .getMany();
  }

  async getByRole(roleId: number) {
    return this.dataAccessRepository
      .createQueryBuilder('da')
      .leftJoinAndSelect('da.module', 'module')
      .leftJoinAndSelect('da.user_data_access', 'uda')
      .leftJoinAndSelect('uda.user', 'user')
      .leftJoinAndSelect('uda.permission', 'permission')
      .leftJoinAndSelect('da.role_data_access', 'rda')
      .leftJoinAndSelect('rda.role', 'role')
      .where('rda.role_id = :roleId', { roleId })
      .andWhere('rda.deleted_at IS NULL')
      .getMany();
  }

  // ── Records Browser ─────────────────────────────────────────────────────────

  async getRecords(tableName: string, dto: SearchRecordsDto, pagination: PaginationParams) {
    if (!ALLOWED_TABLES.has(tableName)) {
      throw new BadRequestException('table_not_allowed');
    }

    const nameCol = getNameColumn(tableName);
    const params: any[] = [];
    let whereClause = 'WHERE deleted_at IS NULL';

    if (dto.search) {
      params.push(`%${dto.search}%`);
      whereClause += ` AND (CAST(id AS TEXT) ILIKE $${params.length} OR CAST(${nameCol} AS TEXT) ILIKE $${params.length})`;
    }

    if (dto.date_from) {
      params.push(dto.date_from);
      whereClause += ` AND created_at >= $${params.length}`;
    }

    if (dto.date_to) {
      params.push(dto.date_to);
      whereClause += ` AND created_at <= $${params.length}`;
    }

    // Count total matching rows
    const countQuery = `SELECT COUNT(*)::int as total FROM "${tableName}" ${whereClause}`;
    const countResult = await this.connection.query<{ total: number }[]>(countQuery, params);
    const total: number = countResult[0]?.total || 0;

    // Fetch paginated data
    params.push(pagination.limit, pagination.skip || 0);
    const dataQuery = `SELECT id, ${nameCol} as display_name, created_at FROM "${tableName}" ${whereClause} ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const data = await this.connection.query<Record<string, unknown>[]>(dataQuery, params);

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
}
