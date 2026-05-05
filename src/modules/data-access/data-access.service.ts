import { SortParams } from '@common/decorators/sort.decorator';
import { PaginationParams } from '@common/decorators/pagination.decorator';
import { CHANGE_ACTION_TYPE, CHANGE_ENTITY_TYPE, SCOPE_TYPE } from '@common/enums';
import { NOT_FOUND } from '@constant/error-messages';
import {
  DataAccess,
  RoleDataAccess,
  UserDataAccess,
  PermissionDataAccess,
} from '@modules/databases/data-access.entity';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
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
    @InjectRepository(RoleDataAccess)
    private readonly roleDataAccessRepo: Repository<RoleDataAccess>,
    @InjectRepository(UserDataAccess)
    private readonly userDataAccessRepo: Repository<UserDataAccess>,
    @InjectRepository(PermissionDataAccess)
    private readonly permissionDataAccessRepo: Repository<PermissionDataAccess>,
  ) {}

  // ── Junction helpers ────────────────────────────────────────────────────────

  /** Insert junction rows for roles/users/permissions linked to a data_access record */
  private async insertJunctions(
    dataAccessId: number,
    roleIds?: number[],
    userIds?: number[],
    permissionIds?: number[],
  ) {
    if (roleIds?.length) {
      await this.roleDataAccessRepo.insert(
        roleIds.map((role_id) => ({ role_id, data_access_id: dataAccessId })),
      );
    }
    if (userIds?.length) {
      await this.userDataAccessRepo.insert(
        userIds.map((user_id) => ({ user_id, data_access_id: dataAccessId })),
      );
    }
    if (permissionIds?.length) {
      await this.permissionDataAccessRepo.insert(
        permissionIds.map((permission_id) => ({ permission_id, data_access_id: dataAccessId })),
      );
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

    if (dto.table_name) {
      params.push(`%${dto.table_name}%`);
      whereClause += ` AND da.table_name ILIKE $${params.length}`;
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

    // Flatten: UNION of roles and users per rule (filter soft-deleted junctions)
    const flattenCTE = `
      WITH flattened AS (
        SELECT da.id as rule_id, da.data_id, da.table_name, da.scope_type,
               da.start_date, da.end_date, da.created_at,
               'role' as subject_type, r.id as subject_id, r.name as subject_name
        FROM data_access da
        JOIN data_access_roles dar ON dar.data_access_id = da.id AND dar.deleted_at IS NULL
        JOIN role r ON r.id = dar.role_id
        WHERE da.deleted_at IS NULL
        UNION ALL
        SELECT da.id as rule_id, da.data_id, da.table_name, da.scope_type,
               da.start_date, da.end_date, da.created_at,
               'user' as subject_type, u.id as subject_id,
               COALESCE(u.full_name, u.username) as subject_name
        FROM data_access da
        JOIN data_access_users dau ON dau.data_access_id = da.id AND dau.deleted_at IS NULL
        JOIN users u ON u.id = dau.user_id
        WHERE da.deleted_at IS NULL
      )`;

    const sortField = sortParams?.sort_field || 'created_at';
    const sortOrder = sortParams?.sort_order || 'DESC';
    const allowedSortFields = ['created_at', 'data_id', 'table_name', 'scope_type'];
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
      SELECT s.rule_id, s.data_id, s.table_name, s.scope_type,
             s.start_date, s.end_date, s.created_at,
             s.subject_type, s.subject_id, s.subject_name
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
        'role_data_access', 'role_data_access.role',
        'user_data_access', 'user_data_access.user',
        'permission_data_access', 'permission_data_access.permission',
      ],
    });
    if (!record) throw new NotFoundException(NOT_FOUND);

    // Fetch the referenced record info from the target table
    let record_info: { id: number; display_name: string } | null = null;
    if (ALLOWED_TABLES.has(record.table_name)) {
      const nameCol = getNameColumn(record.table_name);
      const rows: { id: number; display_name: string }[] = await this.connection.query(
        `SELECT id, "${nameCol}" as display_name FROM "${record.table_name}" WHERE id = $1 AND deleted_at IS NULL`,
        [record.data_id],
      );
      if (rows.length > 0) {
        record_info = { id: rows[0].id, display_name: rows[0].display_name || `ID: ${rows[0].id}` };
      }
    }

    return { ...record, record_info };
  }

  /**
   * Create or upsert data access rules.
   * For each data_id: if a rule already exists for same data_id + table_name,
   * update scope/dates and add new junction links. Otherwise create a new rule.
   */
  async create(dto: CreateDataAccessDto, performedBy = 'system') {
    if (!dto.role_ids?.length && !dto.user_ids?.length) {
      throw new BadRequestException('data_access_must_have_role_or_user');
    }

    if (!ALLOWED_TABLES.has(dto.table_name)) {
      throw new BadRequestException('table_not_allowed');
    }

    // Hierarchy validation — only for allow rules
    if (dto.scope_type === SCOPE_TYPE.ALLOW) {
      await this.hierarchyValidation.enforce(dto.data_ids, dto.table_name, dto.user_ids || [], dto.role_ids || []);
    }

    const savedIds: number[] = [];

    for (const dataId of dto.data_ids) {
      // Check for existing rule with same data_id + table_name
      const existing = await this.dataAccessRepository.findOne({
        where: { data_id: dataId, table_name: dto.table_name, deleted_at: IsNull() },
        relations: ['role_data_access', 'user_data_access', 'permission_data_access'],
      });

      let savedId: number;

      if (existing) {
        // UPDATE existing rule — overwrite scope/dates
        existing.scope_type = dto.scope_type;
        existing.start_date = dto.start_date;
        existing.end_date = dto.end_date;
        await this.dataAccessRepository.save(existing);
        savedId = existing.id;

        // Add only new junction links (skip already linked ones)
        const existingRoleIds = existing.role_data_access.map((rda) => rda.role_id);
        const existingUserIds = existing.user_data_access.map((uda) => uda.user_id);
        const existingPermIds = existing.permission_data_access.map((pda) => pda.permission_id);

        const newRoleIds = dto.role_ids?.filter((id) => !existingRoleIds.includes(id));
        const newUserIds = dto.user_ids?.filter((id) => !existingUserIds.includes(id));
        const newPermIds = dto.permission_ids?.filter((id) => !existingPermIds.includes(id));

        await this.insertJunctions(savedId, newRoleIds, newUserIds, newPermIds);
      } else {
        // CREATE new rule
        const record = this.dataAccessRepository.create({
          data_id: dataId,
          table_name: dto.table_name,
          scope_type: dto.scope_type,
          start_date: dto.start_date,
          end_date: dto.end_date,
        });
        const saved = await this.dataAccessRepository.save(record);
        savedId = saved.id;

        await this.insertJunctions(savedId, dto.role_ids, dto.user_ids, dto.permission_ids);
      }

      savedIds.push(savedId);
    }

    this.historyLogger
      .log({
        entity_type: CHANGE_ENTITY_TYPE.DATA_ACCESS,
        action_type: CHANGE_ACTION_TYPE.CREATE,
        entity_id: savedIds.join(','),
        entity_name: dto.table_name,
        performed_by: performedBy,
        old_value: null,
        new_value: {
          table_name: dto.table_name,
          data_ids: dto.data_ids,
          scope_type: dto.scope_type,
          start_date: dto.start_date || null,
          end_date: dto.end_date || null,
          roles: dto.role_ids?.length
            ? (await this.connection.query('SELECT name FROM role WHERE id = ANY($1)', [dto.role_ids])).map(
                (r: any) => r.name,
              )
            : [],
          users: dto.user_ids?.length
            ? (await this.connection.query('SELECT username FROM users WHERE id = ANY($1)', [dto.user_ids])).map(
                (u: any) => u.username,
              )
            : [],
        },
      })
      .catch(() => {});

    return { ids: savedIds };
  }

  /**
   * Update a data access rule by id.
   * Updates scope/dates and replaces junction links.
   */
  async update(id: number, dto: UpdateDataAccessDto, performedBy = 'system') {
    const old = await this.dataAccessRepository.findOne({
      where: { id },
      relations: [
        'role_data_access', 'role_data_access.role',
        'user_data_access', 'user_data_access.user',
        'permission_data_access', 'permission_data_access.permission',
      ],
    });
    if (!old) throw new NotFoundException(NOT_FOUND);

    // Capture old values for history
    const oldValue = {
      table_name: old.table_name,
      data_id: old.data_id,
      scope_type: old.scope_type,
      roles: old.role_data_access.map((rda) => rda.role?.name),
      users: old.user_data_access.map((uda) => uda.user?.username),
      start_date: old.start_date,
      end_date: old.end_date,
    };

    // Hierarchy validation for allow rules
    const newScopeType = dto.scope_type ?? old.scope_type;
    if (newScopeType === SCOPE_TYPE.ALLOW) {
      const userIds = dto.user_ids ?? old.user_data_access.map((uda) => uda.user_id);
      const roleIds = dto.role_ids ?? old.role_data_access.map((rda) => rda.role_id);
      await this.hierarchyValidation.enforce([old.data_id], old.table_name, userIds, roleIds);
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

      // Replace user junctions if provided
      if (dto.user_ids) {
        await manager.delete(UserDataAccess, { data_access_id: id });
        if (dto.user_ids.length) {
          await manager.insert(
            UserDataAccess,
            dto.user_ids.map((user_id) => ({ user_id, data_access_id: id })),
          );
        }
      }

      // Replace permission junctions if provided
      if (dto.permission_ids) {
        await manager.delete(PermissionDataAccess, { data_access_id: id });
        if (dto.permission_ids.length) {
          await manager.insert(
            PermissionDataAccess,
            dto.permission_ids.map((permission_id) => ({ permission_id, data_access_id: id })),
          );
        }
      }
    });

    // Resolve new role/user names for history
    const newRoleNames = dto.role_ids?.length
      ? (await this.connection.query('SELECT name FROM role WHERE id = ANY($1)', [dto.role_ids])).map(
          (r: any) => r.name,
        )
      : oldValue.roles;
    const newUserNames = dto.user_ids?.length
      ? (await this.connection.query('SELECT username FROM users WHERE id = ANY($1)', [dto.user_ids])).map(
          (u: any) => u.username,
        )
      : oldValue.users;

    this.historyLogger
      .log({
        entity_type: CHANGE_ENTITY_TYPE.DATA_ACCESS,
        action_type: CHANGE_ACTION_TYPE.UPDATE,
        entity_id: String(id),
        entity_name: old.table_name,
        performed_by: performedBy,
        old_value: oldValue,
        new_value: {
          scope_type: dto.scope_type ?? old.scope_type,
          roles: newRoleNames,
          users: newUserNames,
          start_date: dto.start_date ?? old.start_date,
          end_date: dto.end_date ?? old.end_date,
        },
      })
      .catch(() => {});

    return { id };
  }

  async delete(id: number, performedBy = 'system') {
    const record = await this.dataAccessRepository.findOne({
      where: { id },
      relations: ['role_data_access', 'role_data_access.role', 'user_data_access', 'user_data_access.user'],
    });
    if (!record) throw new NotFoundException(NOT_FOUND);

    await this.connection.transaction(async (manager) => {
      // Soft-delete junction records
      await manager.softDelete(RoleDataAccess, { data_access_id: id });
      await manager.softDelete(UserDataAccess, { data_access_id: id });
      await manager.softDelete(PermissionDataAccess, { data_access_id: id });
      // Soft-delete the rule itself
      await manager.softDelete(DataAccess, { id });
    });

    this.historyLogger
      .log({
        entity_type: CHANGE_ENTITY_TYPE.DATA_ACCESS,
        action_type: CHANGE_ACTION_TYPE.DELETE,
        entity_id: String(id),
        entity_name: record.table_name,
        performed_by: performedBy,
        old_value: {
          table_name: record.table_name,
          data_id: record.data_id,
          scope_type: record.scope_type,
          roles: record.role_data_access.map((rda) => rda.role?.name),
          users: record.user_data_access.map((uda) => uda.user?.email || uda.user?.username),
        },
        new_value: null,
      })
      .catch(() => {});

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
      relations: ['role_data_access', 'role_data_access.role', 'user_data_access', 'user_data_access.user'],
    });
    if (!record) throw new NotFoundException(NOT_FOUND);

    // Soft-delete the specific junction row
    if (subjectType === 'role') {
      await this.roleDataAccessRepo.softDelete({ data_access_id: ruleId, role_id: subjectId });
    } else {
      await this.userDataAccessRepo.softDelete({ data_access_id: ruleId, user_id: subjectId });
    }

    // Check if any subjects remain
    const remainingRoles = record.role_data_access.filter(
      (rda) => !(subjectType === 'role' && rda.role_id === subjectId),
    ).length;
    const remainingUsers = record.user_data_access.filter(
      (uda) => !(subjectType === 'user' && uda.user_id === subjectId),
    ).length;

    if (remainingRoles === 0 && remainingUsers === 0) {
      await this.dataAccessRepository.softDelete({ id: ruleId });
    }

    this.historyLogger
      .log({
        entity_type: CHANGE_ENTITY_TYPE.DATA_ACCESS,
        action_type: CHANGE_ACTION_TYPE.DELETE,
        entity_id: String(ruleId),
        entity_name: record.table_name,
        performed_by: performedBy,
        old_value: {
          table_name: record.table_name,
          data_id: record.data_id,
          removed_subject_type: subjectType,
          removed_subject_name:
            subjectType === 'role'
              ? record.role_data_access.find((rda) => rda.role_id === subjectId)?.role?.name || String(subjectId)
              : record.user_data_access.find((uda) => uda.user_id === subjectId)?.user?.email ||
                record.user_data_access.find((uda) => uda.user_id === subjectId)?.user?.username ||
                String(subjectId),
        },
        new_value: null,
      })
      .catch(() => {});

    return { rule_id: ruleId, removed: { subject_type: subjectType, subject_id: subjectId } };
  }

  async getByUser(userId: number) {
    return this.dataAccessRepository
      .createQueryBuilder('da')
      .leftJoinAndSelect('da.user_data_access', 'uda')
      .leftJoinAndSelect('uda.user', 'user')
      .leftJoinAndSelect('da.role_data_access', 'rda')
      .leftJoinAndSelect('rda.role', 'role')
      .leftJoinAndSelect('da.permission_data_access', 'pda')
      .leftJoinAndSelect('pda.permission', 'permission')
      .where('uda.user_id = :userId', { userId })
      .andWhere('uda.deleted_at IS NULL')
      .getMany();
  }

  async getByRole(roleId: number) {
    return this.dataAccessRepository
      .createQueryBuilder('da')
      .leftJoinAndSelect('da.user_data_access', 'uda')
      .leftJoinAndSelect('uda.user', 'user')
      .leftJoinAndSelect('da.role_data_access', 'rda')
      .leftJoinAndSelect('rda.role', 'role')
      .leftJoinAndSelect('da.permission_data_access', 'pda')
      .leftJoinAndSelect('pda.permission', 'permission')
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
