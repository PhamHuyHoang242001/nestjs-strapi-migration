import { SortParams } from '@common/decorators/sort.decorator';
import { PaginationParams } from '@common/decorators/pagination.decorator';
import { execQueryAll, execQueryPaignation } from '@common/utils/common';
import { NOT_FOUND } from '@constant/error-messages';
import { Permission } from '@modules/databases/permission.entity';
import { Role } from '@modules/databases/role.entity';
import { Users } from '@modules/databases/user.entity';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateDataAccessDto } from './dto/create-data-access.dto';
import { SearchDataAccessDto } from './dto/search-data-access.dto';
import { SearchRecordsDto } from './dto/search-records.dto';
import { UpdateDataAccessDto } from './dto/update-data-access.dto';
import { DataAccessRepository } from './repository/data-access.repository';

@Injectable()
export class DataAccessService {
  // Whitelist of tables allowed for the records browser
  private readonly ALLOWED_TABLES = new Set([
    'bi_hub_reports',
    'ma_tool_templates',
    'ma_tool_documents',
    'bi_payment_projects',
    'bi_payment_programs',
    'bi_payment_work_steps',
    'ma_tool_workspaces',
    'bi_diagnostic_categories',
    'bi_diagnostic_reports',
    'bi_payment_checklists',
    'bi_payment_other_files',
  ]);

  constructor(
    private readonly dataAccessRepository: DataAccessRepository,
    private readonly connection: DataSource,
  ) {}

  // ── DataAccess CRUD ─────────────────────────────────────────────────────────

  async search(dto: SearchDataAccessDto, sortParams: SortParams, pagination: PaginationParams) {
    const query = this.dataAccessRepository.buildSearchQuery(dto, sortParams);
    const { page, limit } = pagination;
    if (limit === -1) return execQueryAll(query);
    return execQueryPaignation(query, page, limit);
  }

  async details(id: number) {
    const record = await this.dataAccessRepository.findOne({
      where: { id },
      relations: ['roles', 'users', 'permissions'],
    });
    if (!record) throw new NotFoundException(NOT_FOUND);
    return record;
  }

  async create(dto: CreateDataAccessDto) {
    if (!dto.role_ids?.length && !dto.user_ids?.length) {
      throw new BadRequestException('data_access_must_have_role_or_user');
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

    await this.dataAccessRepository.softDelete({ id });

    const users: Users[] = dto.user_ids?.map((uid) => ({ id: uid }) as Users) ?? old.users;
    const roles: Role[] = dto.role_ids?.map((rid) => ({ id: rid }) as Role) ?? old.roles;
    const permissions: Permission[] = dto.permission_ids?.map((pid) => ({ id: pid }) as Permission) ?? old.permissions;

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

    const saved = await this.dataAccessRepository.save(newRecord);
    return { id: saved.id };
  }

  async delete(id: number) {
    await this.dataAccessRepository.findOneByIdValid(id);
    await this.dataAccessRepository.softDelete({ id });
    return { id };
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

  /**
   * Detects the primary display/name column for a given whitelisted table.
   * Falls back to 'id' when no specific mapping exists.
   */
  private detectNameColumn(tableName: string): string {
    const map: Record<string, string> = {
      bi_hub_reports: 'name',
      ma_tool_templates: 'name',
      ma_tool_documents: 'document_name',
      bi_payment_projects: 'project_name',
      bi_payment_programs: 'name',
      bi_payment_work_steps: 'step_name',
      ma_tool_workspaces: 'name',
      bi_diagnostic_categories: 'name',
      bi_diagnostic_reports: 'name',
    };
    const col = map[tableName] || 'id';
    // Defense-in-depth: validate column name is safe for SQL interpolation
    if (!/^[a-z_]+$/.test(col)) return 'id';
    return col;
  }

  /**
   * Browses records from a whitelisted table using parameterized raw queries
   * to prevent SQL injection. Table name is validated against ALLOWED_TABLES.
   */
  async getRecords(tableName: string, dto: SearchRecordsDto, pagination: PaginationParams) {
    if (!this.ALLOWED_TABLES.has(tableName)) {
      throw new BadRequestException('table_not_allowed');
    }

    const nameCol = this.detectNameColumn(tableName);
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
