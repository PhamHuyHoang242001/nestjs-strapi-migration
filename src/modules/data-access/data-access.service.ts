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
import {
  ALLOWED_TABLES,
  RULE_TARGET_TABLES,
  NAME_COLUMN_MAP,
  OWNER_ALL_TABLES,
  OWNER_ALL_RESOURCE_ID,
  ROOT_OWNER_CONFIG,
  getExtraFields,
  getNameColumn,
} from './constants/hierarchy-config';
import { buildOwnerJoinChain, buildAccessibleCTE } from './helpers/owner-scope-helpers';
import { CreateDataAccessDto } from './dto/create-data-access.dto';
import { SearchDataAccessDto } from './dto/search-data-access.dto';
import { SearchRecordsDto } from './dto/search-records.dto';
import { UpdateDataAccessDto } from './dto/update-data-access.dto';
import { HierarchyValidationService } from './hierarchy-validation.service';
import { DataAccessRepository } from './repository/data-access.repository';
import { RecordPathService } from './services/record-path.service';
import { ChangeHistoryLogger } from '@modules/change-history/change-history-logger.service';

/** User context for owner scoping */
export interface ScopeUserInfo {
  userId?: number;
  client?: string | null;
}

@Injectable()
export class DataAccessService {
  constructor(
    private readonly dataAccessRepository: DataAccessRepository,
    private readonly connection: DataSource,
    private readonly hierarchyValidation: HierarchyValidationService,
    private readonly historyLogger: ChangeHistoryLogger,
    private readonly permissionCache: PermissionCacheService,
    private readonly recordPath: RecordPathService,
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
   * List data access rules grouped by (data_id, module_id).
   * Each group = 1 record with its rules array + record name from target table.
   * Pagination applies at group level.
   */
  async list(dto: SearchDataAccessDto, sortParams: SortParams, pagination: PaginationParams, userInfo?: ScopeUserInfo) {
    const isUnscoped = !userInfo;

    // Scoped path: resolve owner scope via accessible CTE
    let ownerCtePrefix = '';
    let ownerWhereClause = '';
    let ownerParams: any[] = [];

    if (!isUnscoped) {
      const roleRows: { role_id: number }[] = await this.connection.query(
        'SELECT role_id FROM user_roles WHERE user_id = $1 AND deleted_at IS NULL',
        [userInfo.userId],
      );
      const roleIds = roleRows.map((r) => r.role_id);
      if (!roleIds.length) {
        return {
          data: [],
          meta: {
            totalItems: 0,
            itemCount: 0,
            itemsPerPage: pagination.limit,
            currentPage: pagination.page,
            totalPages: 1,
          },
        };
      }

      ownerParams = [roleIds];
      const { cteSql } = buildAccessibleCTE('$1');
      ownerCtePrefix = `accessible AS (\n${cteSql}\n)`;
      ownerWhereClause = ` AND (m.table_name, da.data_id) IN (SELECT table_name, data_id FROM accessible)`;
    }

    const { ctePrefix, whereClause, params } = this.buildGroupFilterClause(dto, ownerParams.length);

    // Merge CTEs: owner accessible + search name_matches
    let mergedCtePrefix: string;
    if (ownerCtePrefix && ctePrefix) {
      // ctePrefix starts with "WITH name_matches AS (...)" — strip "WITH" and combine
      const searchCte = ctePrefix.replace(/^WITH\s+/, '');
      mergedCtePrefix = `WITH ${ownerCtePrefix}, ${searchCte}`;
    } else if (ownerCtePrefix) {
      mergedCtePrefix = `WITH ${ownerCtePrefix}`;
    } else {
      mergedCtePrefix = ctePrefix;
    }

    // Merge params: owner params first, then shift search params
    const mergedParams = [...ownerParams, ...params];
    // Unscoped path (admin/super_admin) has no accessible CTE, so a data_access
    // rule pointing at a since-deleted target record leaked through as if still
    // active. The scoped path is already guarded (accessible CTE branches filter
    // deleted_at + is_deleted). Add a per-table EXISTS predicate here so both
    // paths share the same "live target record" contract. No params are introduced
    // (table names are identifiers, data_id is a column reference), so existing
    // param indexes stay valid.
    const targetExistsClause = isUnscoped ? this.buildTargetExistsClause() : '';
    const mergedWhereClause = whereClause + ownerWhereClause + targetExistsClause;

    const cteLine = mergedCtePrefix ? `${mergedCtePrefix} ` : '';

    // Step 1a: Count distinct groups
    const countQuery = `${cteLine}SELECT COUNT(*)::int as total FROM (
      SELECT DISTINCT da.data_id, da.module_id FROM data_access da
      JOIN modules m ON m.id = da.module_id
      LEFT JOIN data_access_roles dar ON dar.data_access_id = da.id AND dar.deleted_at IS NULL
      LEFT JOIN role r ON r.id = dar.role_id
      LEFT JOIN data_access_users dau ON dau.data_access_id = da.id AND dau.deleted_at IS NULL
      LEFT JOIN users u ON u.id = dau.user_id
      ${mergedWhereClause}
    ) groups`;
    const countResult = await this.connection.query(countQuery, mergedParams);
    const total: number = countResult[0]?.total || 0;

    // Step 1b: Paginated groups with module info
    const { page, limit } = pagination;
    const offset = (page - 1) * limit;
    const limitIdx = mergedParams.length + 1;
    const offsetIdx = mergedParams.length + 2;
    const groupParams = [...mergedParams, limit, offset];
    const safeSortOrder = sortParams?.sort_order === 'ASC' ? 'ASC' : 'DESC';

    const groupsQuery = `${cteLine}
      SELECT da.data_id, da.module_id, m.table_name, m.path as module_path, m.name as module_name,
             MAX(da.created_at) as latest_created_at
      FROM data_access da
      JOIN modules m ON m.id = da.module_id
      LEFT JOIN data_access_roles dar ON dar.data_access_id = da.id AND dar.deleted_at IS NULL
      LEFT JOIN role r ON r.id = dar.role_id
      LEFT JOIN data_access_users dau ON dau.data_access_id = da.id AND dau.deleted_at IS NULL
      LEFT JOIN users u ON u.id = dau.user_id
      ${mergedWhereClause}
      GROUP BY da.data_id, da.module_id, m.table_name, m.path, m.name
      ORDER BY latest_created_at ${safeSortOrder}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

    const groups: any[] = await this.connection.query(groupsQuery, groupParams);
    if (!groups.length) {
      return {
        data: [],
        meta: {
          totalItems: total,
          itemCount: 0,
          itemsPerPage: limit,
          currentPage: page,
          totalPages: Math.ceil(total / limit) || 1,
        },
      };
    }

    // Step 2: Fetch flattened rules for these groups
    const rules = await this.fetchRulesForGroups(groups);

    // Step 3: Batch fetch record names + extra fields from target tables
    const recordInfos = await this.batchFetchRecordInfo(groups);

    // Step 3b: Build root→leaf record path per group (breadcrumb). Per-record
    // walk via HIERARCHY_MAP; isolated catch so one bad record can't fail the list.
    const recordPaths = await Promise.all(
      groups.map((g) =>
        g.table_name && RULE_TARGET_TABLES.has(g.table_name)
          ? this.recordPath.buildPath(g.table_name, g.data_id).catch(() => `ID: ${g.data_id}`)
          : Promise.resolve(`ID: ${g.data_id}`),
      ),
    );

    // Step 4: Assemble grouped response
    const rulesByGroup = new Map<string, any[]>();
    for (const rule of rules) {
      const key = `${rule.data_id}-${rule.module_id}`;
      const arr = rulesByGroup.get(key) || [];
      arr.push({
        rule_id: rule.rule_id,
        scope_type: rule.scope_type,
        subject_type: rule.subject_type,
        subject_id: rule.subject_id,
        subject_name: rule.subject_name,
        permissions: rule.permissions,
        start_date: rule.start_date,
        end_date: rule.end_date,
        created_at: rule.created_at,
      });
      rulesByGroup.set(key, arr);
    }

    const data = groups.map((g, i) => {
      const info = recordInfos.get(`${g.data_id}-${g.module_id}`);
      return {
        data_id: g.data_id,
        module_id: g.module_id,
        module_name: g.module_name,
        module_path: g.module_path,
        record_name: info?.record_name || `ID: ${g.data_id}`,
        record_path: recordPaths[i],
        table_name: g.table_name,
        // record_extra only present when the table has declared extra fields
        // AND a live row was fetched. Empty/missing config or soft-deleted row
        // → key absent (spread conditional keeps base contract unchanged).
        ...(info?.record_extra ? { record_extra: info.record_extra } : {}),
        rules: rulesByGroup.get(`${g.data_id}-${g.module_id}`) || [],
      };
    });

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

  /**
   * Build an EXISTS predicate that confirms the target record (the row a
   * data_access rule points at via da.data_id + m.table_name) is still live.
   *
   * Used by the unscoped list path (admin/super_admin) where no accessible CTE
   * guards record visibility. Each RULE_TARGET_TABLE contributes one EXISTS branch
   * gated on its own table_name; the dual-column deleted check (deleted_at +
   * is_deleted) mirrors the rest of the read path so records deleted via either
   * path are excluded. RULE_TARGET_TABLES (not ALLOWED_TABLES) bounds the branch
   * set to tables that may actually hold a rule — leaf tables inherit scope and
   * never carry their own rule, so checking target-row existence for them is dead.
   *
   * A trailing catch-all (`m.table_name NOT IN (...)`) keeps rules pointing at
   * non-target tables visible — resolveModule() blocks creating such rules, but
   * legacy rows must not silently vanish from the list. Returns '' when no
   * target tables exist.
   *
   * No bind params: table names are static identifiers from RULE_TARGET_TABLES and
   * data_id is a column reference, so existing $N indexes in the caller stay valid.
   */
  private buildTargetExistsClause(): string {
    const branches: string[] = [];
    const allowedList: string[] = [];
    for (const tableName of RULE_TARGET_TABLES) {
      allowedList.push(`'${tableName}'`);
      branches.push(
        `(m.table_name = '${tableName}' AND EXISTS (SELECT 1 FROM "${tableName}" t WHERE t.id = da.data_id AND t.deleted_at IS NULL AND t.is_deleted IS NOT TRUE))`,
      );
    }
    if (!branches.length) return '';
    // Non-allowed tables: no target row to check, keep prior behavior (visible).
    branches.push(`m.table_name NOT IN (${allowedList.join(', ')})`);
    return ` AND (${branches.join(' OR ')})`;
  }

  /**
   * Build WHERE clause with params for group-level filtering.
   * When dto.keyword is present, includes a name_matches CTE to search record names in target tables.
   * Returns { ctePrefix, whereClause, params }.
   */
  private buildGroupFilterClause(dto: SearchDataAccessDto, paramOffset = 0) {
    const params: any[] = [];
    let ctePrefix = '';
    let whereClause = 'WHERE da.deleted_at IS NULL';

    const idx = () => params.length + paramOffset;

    if (dto.module_id) {
      params.push(dto.module_id);
      whereClause += ` AND da.module_id = $${idx()}`;
    }
    if (dto.scope_type) {
      params.push(dto.scope_type);
      whereClause += ` AND da.scope_type = $${idx()}`;
    }
    // "has at least one" — groups with mixed subjects still appear under either filter
    if (dto.subject_type === 'role') {
      whereClause += ` AND dar.id IS NOT NULL`;
    } else if (dto.subject_type === 'user') {
      whereClause += ` AND dau.id IS NOT NULL`;
    }
    if (dto.role_id) {
      params.push(dto.role_id);
      whereClause += ` AND dar.role_id = $${idx()}`;
    }
    if (dto.user_id) {
      params.push(dto.user_id);
      whereClause += ` AND dau.user_id = $${idx()}`;
    }
    if (dto.keyword) {
      const kw = dto.keyword.trim();
      const isNumeric = /^\d+$/.test(kw);

      // For record name search: always use ILIKE partial match
      params.push(`%${kw}%`);
      const likeParam = `$${idx()}`;

      // Build name_matches CTE: UNION across target tables for record name search
      const nameMatchBranches = this.buildNameMatchesCTE(likeParam, dto.module_id);
      ctePrefix = `WITH name_matches AS (\n${nameMatchBranches}\n)`;

      if (isNumeric) {
        // Exact match on data_id when keyword is a number, OR partial match on record name
        params.push(Number(kw));
        const exactParam = `$${idx()}`;
        whereClause += ` AND (da.data_id = ${exactParam} OR (da.data_id, da.module_id) IN (SELECT data_id, module_id FROM name_matches))`;
      } else {
        // Non-numeric: only search record name via name_matches CTE
        whereClause += ` AND (da.data_id, da.module_id) IN (SELECT data_id, module_id FROM name_matches)`;
      }
    }

    return { ctePrefix, whereClause, params };
  }

  /** Build UNION ALL branches for searching record names across rule-target tables */
  private buildNameMatchesCTE(searchParam: string, moduleId?: number): string {
    // If module_id filter is set, we only need to search that specific module's table
    // Otherwise search all rule-target tables via modules join. RULE_TARGET_TABLES
    // (not ALLOWED_TABLES): a rule can only target these tables, so searching leaf
    // tables for a name match would never correspond to a rule and only adds noise.
    const branches: string[] = [];
    for (const [tableName, nameCol] of Object.entries(NAME_COLUMN_MAP)) {
      if (!RULE_TARGET_TABLES.has(tableName)) continue;
      const safeCol = /^[a-z_]+$/.test(nameCol) ? nameCol : 'id';
      branches.push(
        `SELECT t.id as data_id, m.id as module_id FROM "${tableName}" t JOIN modules m ON m.table_name = '${tableName}' AND m.deleted_at IS NULL WHERE CAST(t."${safeCol}" AS TEXT) ILIKE ${searchParam} AND t.deleted_at IS NULL${moduleId ? ` AND m.id = ${Number(moduleId)}` : ''}`,
      );
    }
    return branches.join('\nUNION ALL\n');
  }

  /** Fetch flattened rules (role + user branches) for a set of groups */
  private async fetchRulesForGroups(groups: { data_id: number; module_id: number }[]) {
    const validGroups = groups.filter((g) => Number.isInteger(g.data_id) && Number.isInteger(g.module_id));
    if (!validGroups.length) return [];
    const tuples = validGroups.map((g) => `(${Number(g.data_id)}, ${Number(g.module_id)})`).join(', ');
    const rulesQuery = `
      WITH flattened AS (
        SELECT da.id as rule_id, da.data_id, da.module_id,
               da.scope_type, da.start_date, da.end_date, da.created_at,
               'role' as subject_type, r.id as subject_id, r.name as subject_name,
               NULL::jsonb as permissions
        FROM data_access da
        JOIN data_access_roles dar ON dar.data_access_id = da.id AND dar.deleted_at IS NULL
        JOIN role r ON r.id = dar.role_id
        WHERE da.deleted_at IS NULL AND (da.data_id, da.module_id) IN (${tuples})
        UNION ALL
        SELECT da.id as rule_id, da.data_id, da.module_id,
               da.scope_type, da.start_date, da.end_date, da.created_at,
               'user' as subject_type, u.id as subject_id,
               COALESCE(u.full_name, u.username) as subject_name,
               json_agg(json_build_object('id', p.id, 'name', p.name))::jsonb as permissions
        FROM data_access da
        JOIN data_access_users dau ON dau.data_access_id = da.id AND dau.deleted_at IS NULL
        JOIN users u ON u.id = dau.user_id
        JOIN permission p ON p.id = dau.permission_id AND p.deleted_at IS NULL
        WHERE da.deleted_at IS NULL AND (da.data_id, da.module_id) IN (${tuples})
        GROUP BY da.id, da.data_id, da.module_id,
                 da.scope_type, da.start_date, da.end_date, da.created_at, u.id, u.full_name, u.username
      )
      SELECT * FROM flattened ORDER BY rule_id DESC`;

    return this.connection.query(rulesQuery);
  }

  /** Batch-fetch display names from target tables, grouped by table_name */
  private async batchFetchRecordInfo(
    groups: { data_id: number; module_id: number; table_name: string }[],
  ): Promise<Map<string, { record_name: string; record_extra?: Record<string, any> }>> {
    // Group entries by table_name, preserving each entry's module_id.
    // RULE_TARGET_TABLES: only resolve record info for tables that may carry a rule.
    const byTable = new Map<string, { data_id: number; module_id: number }[]>();
    for (const g of groups) {
      if (!g.table_name || !RULE_TARGET_TABLES.has(g.table_name)) continue;
      const entries = byTable.get(g.table_name) || [];
      entries.push({ data_id: g.data_id, module_id: g.module_id });
      byTable.set(g.table_name, entries);
    }

    const infoMap = new Map<string, { record_name: string; record_extra?: Record<string, any> }>();
    for (const [tableName, entries] of byTable) {
      const nameCol = getNameColumn(tableName);
      // Extra fields from the dev-controlled whitelist (sanitized by regex in
      // getExtraFields). Empty/missing → query stays id+display_name only.
      const extraCols = getExtraFields(tableName);
      const extraSelect = extraCols.length ? `, ${extraCols.map((c) => `"${c}"`).join(', ')}` : '';
      const ids = entries.map((e) => e.data_id);
      try {
        const rows: { id: number; display_name: string; [key: string]: unknown }[] =
          await this.connection.query(
          // Dual-column deleted check: is_deleted flagged OR deleted_at set (both
          // columns live on every ALLOWED_TABLES row; two delete paths each set
          // only one). Without is_deleted, records deleted via the flag path leak
          // their name into the list as if still active.
          `SELECT id, "${nameCol}" as display_name${extraSelect} FROM "${tableName}" WHERE id = ANY($1) AND deleted_at IS NULL AND is_deleted IS NOT TRUE`,
          [ids],
        );
        const rowMap = new Map(rows.map((r) => [r.id, r]));
        for (const entry of entries) {
          const row = rowMap.get(entry.data_id);
          if (!row) {
            infoMap.set(`${entry.data_id}-${entry.module_id}`, { record_name: `ID: ${entry.data_id}` });
            continue;
          }
          // record_extra only built when extra fields are declared. Aliases
          // are the (lowercase) column names, so row[col] maps directly.
          const record_extra = extraCols.length
            ? Object.fromEntries(extraCols.map((c) => [c, row[c]]))
            : undefined;
          infoMap.set(`${entry.data_id}-${entry.module_id}`, {
            record_name: row.display_name || `ID: ${entry.data_id}`,
            record_extra,
          });
        }
      } catch {
        // Per-table failure (e.g. an EXTRA_FIELDS_MAP entry pointing at a column
        // that does not exist on the table). Fall back to name-only with no extra
        // so the list stays 200 OK — mirrors record_path try/catch above.
        for (const entry of entries) {
          infoMap.set(`${entry.data_id}-${entry.module_id}`, { record_name: `ID: ${entry.data_id}` });
        }
      }
    }

    return infoMap;
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

    // Fetch the referenced record info from the target table.
    // RULE_TARGET_TABLES: a rule can only target these tables, so we only resolve
    // record info for them. A legacy row on a non-target table still returns with
    // record_info = null (the rule itself remains visible for audit).
    const tableName = record.module?.table_name;
    let record_info: { id: number; display_name: string } | null = null;
    if (tableName && RULE_TARGET_TABLES.has(tableName)) {
      const nameCol = getNameColumn(tableName);
      const rows: { id: number; display_name: string }[] = await this.connection.query(
        // Dual-column deleted check (see batchFetchRecordInfo comment).
        `SELECT id, "${nameCol}" as display_name FROM "${tableName}" WHERE id = $1 AND deleted_at IS NULL AND is_deleted IS NOT TRUE`,
        [record.data_id],
      );
      if (rows.length > 0) {
        record_info = { id: rows[0].id, display_name: rows[0].display_name || `ID: ${rows[0].id}` };
      }
    }

    // root→leaf breadcrumb for the referenced record (e.g. "BICC / Report").
    // Fallback ID:<data_id> on non-target table or walk failure.
    const record_path = tableName && RULE_TARGET_TABLES.has(tableName)
      ? await this.recordPath.buildPath(tableName, record.data_id).catch(() => `ID: ${record.data_id}`)
      : `ID: ${record.data_id}`;

    return { ...record, record_info, record_path };
  }

  /** Resolve module by ID and validate its table_name is a valid rule target */
  private async resolveModule(moduleId: number): Promise<ModuleEntity> {
    const mod = await this.moduleRepo.findOne({ where: { id: moduleId } });
    if (!mod) throw new NotFoundException('module_not_found');
    // RULE_TARGET_TABLES (subset of ALLOWED_TABLES): only these tables may carry a
    // data_access rule. Rejecting leaf modules here (checklists, other_files, ...)
    // enforces the "bi_payment scoping stops at program" business rule at create time.
    if (!mod.table_name || !RULE_TARGET_TABLES.has(mod.table_name)) {
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

  async getRecords(tableName: string, dto: SearchRecordsDto, pagination: PaginationParams, userInfo?: ScopeUserInfo) {
    // Records browser allows browsing any ALLOWED_TABLES member (leaf tables inherit
    // scope but are still browsable); only rule creation is gated by RULE_TARGET_TABLES.
    if (!ALLOWED_TABLES.has(tableName)) {
      throw new BadRequestException('table_not_allowed');
    }

    const isUnscoped = !userInfo;

    // Scoped path: resolve owner scope
    if (!isUnscoped) {
      return this.getScopedRecords(tableName, dto, pagination, userInfo);
    }

    // Unscoped (no user context — internal callers): return all records
    return this.getUnscopedRecords(tableName, dto, pagination);
  }

  /**
   * List every candidate record (id + display_name + created_at), filtered by
   * keyword/date. Serves two callers with the same "browse all rows" semantics:
   * internal unscoped callers, and admins picking grant candidates for an
   * explicit-only table. Record-level access is enforced elsewhere (assignment
   * mutation stays permission-gated); this is a picker, not a data endpoint.
   */
  private async getUnscopedRecords(tableName: string, dto: SearchRecordsDto, pagination: PaginationParams) {
    const nameCol = getNameColumn(tableName);
    const params: any[] = [];
    // Dual-column deleted check: is_deleted flagged OR deleted_at set.
    let whereClause = 'WHERE deleted_at IS NULL AND is_deleted IS NOT TRUE';

    if (dto.keyword) {
      params.push(`%${dto.keyword}%`);
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

    const countQuery = `SELECT COUNT(*)::int as total FROM "${tableName}" ${whereClause}`;
    const countResult = await this.connection.query<{ total: number }[]>(countQuery, params);
    const total: number = countResult[0]?.total || 0;

    params.push(pagination.limit, pagination.skip || 0);
    const dataQuery = `SELECT id, ${nameCol} as display_name, created_at FROM "${tableName}" ${whereClause} ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const rows = await this.connection.query<Record<string, unknown>[]>(dataQuery, params);
    const data = await this.enrichRecordBrowserRows(tableName, rows);

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

  /** Owner-scoped getRecords for non-admin users */
  private async getScopedRecords(
    tableName: string,
    dto: SearchRecordsDto,
    pagination: PaginationParams,
    userInfo: ScopeUserInfo,
  ) {
    const emptyResult = {
      data: [],
      meta: {
        totalItems: 0,
        itemCount: 0,
        itemsPerPage: pagination.limit,
        currentPage: pagination.page,
        totalPages: 1,
      },
    };

    // Get user's active role IDs
    const roleRows: { role_id: number }[] = await this.connection.query(
      'SELECT role_id FROM user_roles WHERE user_id = $1 AND deleted_at IS NULL',
      [userInfo.userId],
    );
    const roleIds = roleRows.map((r) => r.role_id);
    if (!roleIds.length) return emptyResult;

    // Whole-table SO: a role owning this table (sentinel resource_owners row) sees
    // EVERY row; a non-owner sees none. The sentinel resource_id never matches a
    // real row in the standard owner join, so own-all is resolved here explicitly.
    if (OWNER_ALL_TABLES.has(tableName)) {
      const isOwnerAll = await this.hasOwnerAllAssignment(tableName, roleIds);
      return isOwnerAll ? this.getUnscopedRecords(tableName, dto, pagination) : emptyResult;
    }

    // Build owner join chain
    const ownerChain = buildOwnerJoinChain(tableName, `$1`);
    if (!ownerChain) return emptyResult;

    const nameCol = getNameColumn(tableName);
    const params: any[] = [roleIds];
    let whereExtra = '';

    if (dto.keyword) {
      params.push(`%${dto.keyword}%`);
      whereExtra += ` AND (CAST(t0.id AS TEXT) ILIKE $${params.length} OR CAST(t0."${nameCol}" AS TEXT) ILIKE $${params.length})`;
    }

    if (dto.date_from) {
      params.push(dto.date_from);
      whereExtra += ` AND t0.created_at >= $${params.length}`;
    }

    if (dto.date_to) {
      params.push(dto.date_to);
      whereExtra += ` AND t0.created_at <= $${params.length}`;
    }

    // Count scoped records (dual-column deleted check on target row t0).
    const countQuery = `SELECT COUNT(DISTINCT t0.id)::int as total FROM "${tableName}" t0 ${ownerChain.joinSQL} AND t0.deleted_at IS NULL AND t0.is_deleted IS NOT TRUE${whereExtra}`;
    const countResult = await this.connection.query(countQuery, params);
    const total: number = countResult[0]?.total || 0;

    // Fetch paginated scoped data
    params.push(pagination.limit, pagination.skip || 0);
    const dataQuery = `SELECT DISTINCT t0.id, t0."${nameCol}" as display_name, t0.created_at FROM "${tableName}" t0 ${ownerChain.joinSQL} AND t0.deleted_at IS NULL AND t0.is_deleted IS NOT TRUE${whereExtra} ORDER BY t0.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const rows = await this.connection.query<Record<string, unknown>[]>(dataQuery, params);
    const data = await this.enrichRecordBrowserRows(tableName, rows);

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

  /** Add display metadata shared with the grouped data-access list response. */
  private async enrichRecordBrowserRows(tableName: string, rows: Record<string, unknown>[]) {
    if (!rows.length) return rows;

    const extraFields = getExtraFields(tableName);
    const extrasById = new Map<number, Record<string, unknown>>();

    if (extraFields.length) {
      const ids = rows.map((row) => Number(row.id)).filter(Number.isInteger);
      try {
        const extraRows = await this.connection.query<Record<string, unknown>[]>(
          `SELECT id, ${extraFields.map((field) => `"${field}"`).join(', ')} FROM "${tableName}" WHERE id = ANY($1) AND deleted_at IS NULL AND is_deleted IS NOT TRUE`,
          [ids],
        );
        for (const extraRow of extraRows) {
          extrasById.set(Number(extraRow.id), Object.fromEntries(extraFields.map((field) => [field, extraRow[field]])));
        }
      } catch {
        // A stale extra-field config must not make the records browser unavailable.
      }
    }

    return rows.map((row) => {
      const id = Number(row.id);
      // Temporarily disabled for the records browser only.
      // const record_path = await this.recordPath.buildPath(tableName, id).catch(() => `ID: ${id}`);
      const record_extra = extrasById.get(id);
      return {
        ...row,
        // record_path,
        ...(record_extra ? { record_extra } : {}),
      };
    });
  }

  /**
   * True when any of the caller's roles is a whole-table SO of `tableName`,
   * i.e. holds the sentinel resource_owners row. Ownership is by role, not record.
   */
  private async hasOwnerAllAssignment(tableName: string, roleIds: number[]): Promise<boolean> {
    const resourceType = ROOT_OWNER_CONFIG[tableName]?.resourceType;
    if (!resourceType) return false;
    const rows = await this.connection.query(
      `SELECT 1 FROM resource_owners
       WHERE role_id = ANY($1) AND resource_type = $2 AND resource_id = $3 AND deleted_at IS NULL
       LIMIT 1`,
      [roleIds, resourceType, OWNER_ALL_RESOURCE_ID],
    );
    return rows.length > 0;
  }
}
