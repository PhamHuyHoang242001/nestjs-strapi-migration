import { SortParams } from '@common/decorators/sort.decorator';
import { PaginationParams } from '@common/decorators/pagination.decorator';
import { SCOPE_TYPE } from '@common/enums';
import { execQueryAll, execQueryPaignation } from '@common/utils/common';
import { NOT_FOUND } from '@constant/error-messages';
import { DataAccess } from '@modules/databases/data-access.entity';
import { Permission } from '@modules/databases/permission.entity';
import { Role } from '@modules/databases/role.entity';
import { Users } from '@modules/databases/user.entity';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ALLOWED_TABLES, getNameColumn } from './constants/hierarchy-config';
import { CreateBulkDataAccessDto } from './dto/create-bulk-data-access.dto';
import { CreateDataAccessDto } from './dto/create-data-access.dto';
import { SearchDataAccessDto } from './dto/search-data-access.dto';
import { SearchRecordsDto } from './dto/search-records.dto';
import { UpdateDataAccessDto } from './dto/update-data-access.dto';
import { HierarchyValidationService } from './hierarchy-validation.service';
import { DataAccessRepository } from './repository/data-access.repository';

@Injectable()
export class DataAccessService {
  constructor(
    private readonly dataAccessRepository: DataAccessRepository,
    private readonly connection: DataSource,
    private readonly hierarchyValidation: HierarchyValidationService,
  ) {}

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

    // Flatten: UNION of roles and users per rule
    const flattenCTE = `
      WITH flattened AS (
        SELECT da.id as rule_id, da.data_id, da.table_name, da.scope_type,
               da.start_date, da.end_date, da.created_at,
               'role' as subject_type, r.id as subject_id, r.name as subject_name
        FROM data_access da
        JOIN data_access_roles dar ON dar.data_access_id = da.id
        JOIN role r ON r.id = dar.role_id
        WHERE da.deleted_at IS NULL
        UNION ALL
        SELECT da.id as rule_id, da.data_id, da.table_name, da.scope_type,
               da.start_date, da.end_date, da.created_at,
               'user' as subject_type, u.id as subject_id,
               COALESCE(u.full_name, u.username) as subject_name
        FROM data_access da
        JOIN data_access_users dau ON dau.data_access_id = da.id
        JOIN users u ON u.id = dau.user_id
        WHERE da.deleted_at IS NULL
      )`;

    const sortField = sortParams?.sort_field || 'created_at';
    const sortOrder = sortParams?.sort_order || 'DESC';
    // Validate sort field
    const allowedSortFields = ['created_at', 'data_id', 'table_name', 'scope_type'];
    const safeSortField = allowedSortFields.includes(sortField) ? sortField : 'created_at';
    const safeSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    // Replace da. prefix with s. for the WHERE clause on flattened CTE
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
      relations: ['roles', 'users', 'permissions'],
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

  async create(dto: CreateDataAccessDto) {
    if (!dto.role_ids?.length && !dto.user_ids?.length) {
      throw new BadRequestException('data_access_must_have_role_or_user');
    }

    if (!ALLOWED_TABLES.has(dto.table_name)) {
      throw new BadRequestException('table_not_allowed');
    }

    // Hierarchy validation — only for allow rules
    if (dto.scope_type === SCOPE_TYPE.ALLOW) {
      await this.hierarchyValidation.enforce([dto.data_id], dto.table_name, dto.user_ids || [], dto.role_ids || []);
    }

    const users: Users[] = dto.user_ids?.map((id) => ({ id }) as Users) || [];
    const roles: Role[] = dto.role_ids?.map((id) => ({ id }) as Role) || [];
    const permissions: Permission[] = dto.permission_ids?.map((id) => ({ id }) as Permission) || [];

    const record = this.dataAccessRepository.create({
      data_id: dto.data_id,
      table_name: dto.table_name,
      scope_type: dto.scope_type,
      start_date: dto.start_date,
      end_date: dto.end_date,
      users,
      roles,
      permissions,
    });

    const saved = await this.dataAccessRepository.save(record);
    return { id: saved.id };
  }

  async createBulk(dto: CreateBulkDataAccessDto) {
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
    await this.connection.transaction(async (manager) => {
      for (const dataId of dto.data_ids) {
        // Fresh entity references per iteration to avoid TypeORM mutation leaks
        const users: Users[] = dto.user_ids?.map((id) => ({ id }) as Users) || [];
        const roles: Role[] = dto.role_ids?.map((id) => ({ id }) as Role) || [];
        const permissions: Permission[] = dto.permission_ids?.map((id) => ({ id }) as Permission) || [];

        const record = this.dataAccessRepository.create({
          data_id: dataId,
          table_name: dto.table_name,
          scope_type: dto.scope_type,
          start_date: dto.start_date,
          end_date: dto.end_date,
          users,
          roles,
          permissions,
        });
        const saved = await manager.save(record);
        savedIds.push(saved.id);
      }
    });

    return { ids: savedIds };
  }

  /**
   * Soft-delete+insert pattern for full audit trail.
   * data_id and table_name are immutable — carried over from old record.
   */
  async update(id: number, dto: UpdateDataAccessDto) {
    const old = await this.dataAccessRepository.findOne({
      where: { id },
      relations: ['users', 'roles', 'permissions'],
    });
    if (!old) throw new NotFoundException(NOT_FOUND);

    // Hierarchy validation for allow rules
    const newScopeType = dto.scope_type ?? old.scope_type;
    if (newScopeType === SCOPE_TYPE.ALLOW) {
      const userIds = dto.user_ids ?? old.users.map((u) => u.id);
      const roleIds = dto.role_ids ?? old.roles.map((r) => r.id);
      await this.hierarchyValidation.enforce([old.data_id], old.table_name, userIds, roleIds);
    }

    const users: Users[] = dto.user_ids?.map((uid) => ({ id: uid }) as Users) ?? old.users;
    const roles: Role[] = dto.role_ids?.map((rid) => ({ id: rid }) as Role) ?? old.roles;
    const permissions: Permission[] = dto.permission_ids?.map((pid) => ({ id: pid }) as Permission) ?? old.permissions;

    let savedId: number;
    await this.connection.transaction(async (manager) => {
      await manager.softDelete(DataAccess, { id });

      const newRecord = this.dataAccessRepository.create({
        data_id: old.data_id,
        table_name: old.table_name,
        scope_type: dto.scope_type ?? old.scope_type,
        start_date: dto.start_date ?? old.start_date,
        end_date: dto.end_date ?? old.end_date,
        users,
        roles,
        permissions,
      });

      const saved = await manager.save(newRecord);
      savedId = saved.id;
    });

    return { id: savedId! };
  }

  async delete(id: number) {
    await this.dataAccessRepository.findOneByIdValid(id);
    await this.dataAccessRepository.softDelete({ id });
    return { id };
  }

  /**
   * Remove a specific subject link from a rule.
   * Deletes the junction table row (data_access_roles or data_access_users).
   * If no subjects remain after removal, soft-deletes the entire rule.
   */
  async removeLink(ruleId: number, subjectType: 'role' | 'user', subjectId: number) {
    const record = await this.dataAccessRepository.findOne({
      where: { id: ruleId },
      relations: ['roles', 'users'],
    });
    if (!record) throw new NotFoundException(NOT_FOUND);

    const junctionTable = subjectType === 'role' ? 'data_access_roles' : 'data_access_users';
    const junctionColumn = subjectType === 'role' ? 'role_id' : 'user_id';

    // Delete the specific junction row
    await this.connection.query(
      `DELETE FROM "${junctionTable}" WHERE data_access_id = $1 AND "${junctionColumn}" = $2`,
      [ruleId, subjectId],
    );

    // Check if any subjects remain
    const remainingRoles = record.roles.filter((r) => !(subjectType === 'role' && r.id === subjectId)).length;
    const remainingUsers = record.users.filter((u) => !(subjectType === 'user' && u.id === subjectId)).length;

    if (remainingRoles === 0 && remainingUsers === 0) {
      // No subjects left — soft-delete the rule itself
      await this.dataAccessRepository.softDelete({ id: ruleId });
    }

    return { rule_id: ruleId, removed: { subject_type: subjectType, subject_id: subjectId } };
  }

  async getByUser(userId: number) {
    return this.dataAccessRepository
      .createQueryBuilder('da')
      .leftJoinAndSelect('da.users', 'users')
      .leftJoinAndSelect('da.roles', 'roles')
      .leftJoinAndSelect('da.permissions', 'permissions')
      .where('users.id = :userId', { userId })
      .getMany();
  }

  async getByRole(roleId: number) {
    return this.dataAccessRepository
      .createQueryBuilder('da')
      .leftJoinAndSelect('da.users', 'users')
      .leftJoinAndSelect('da.roles', 'roles')
      .leftJoinAndSelect('da.permissions', 'permissions')
      .where('roles.id = :roleId', { roleId })
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
