import { SortParams } from '@common/decorators/sort.decorator';
import { PaginationParams } from '@common/decorators/pagination.decorator';
import { PermissionCacheService } from '@common/authorization';
import { CHANGE_ACTION_TYPE, CHANGE_ENTITY_TYPE, SCOPE_TYPE, USER_CLIENT, USER_STATUS } from '@common/enums';
import { NOT_FOUND } from '@constant/error-messages';
import { DataAccess, RoleDataAccess, UserDataAccess } from '@modules/databases/data-access.entity';
import { Users, UserType } from '@modules/databases/user.entity';
import { Module as ModuleEntity } from '@modules/databases/module.entity';
import { Permission } from '@modules/databases/permission.entity';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import {
  ALLOWED_TABLES,
  RULE_TARGET_TABLES,
  NAME_COLUMN_MAP,
  OWNER_ALL_TABLES,
  OWNER_ALL_RESOURCE_ID,
  ROOT_OWNER_CONFIG,
  getExtraFields,
  getNameColumn,
  isManageEnabledTable,
  MANAGE_ENABLED_MODULES,
} from './constants/hierarchy-config';
import { CallerContext, ManageAuthorityService } from './helpers/manage-authority.helper';
import { buildOwnerJoinChain, buildAccessibleCTE } from './helpers/owner-scope-helpers';
import { CreateDataAccessDto } from './dto/create-data-access.dto';
import { HandoverDataAccessDto } from './dto/handover-data-access.dto';
import { SearchDataAccessDto } from './dto/search-data-access.dto';
import { CREATOR_ACTIONS } from './services/creator-access-grant.service';
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
    private readonly manageAuthority: ManageAuthorityService,
    // Optional only so the existing `new DataAccessService(...)` unit-test call sites stay
    // valid; Nest always injects it in production (no @Optional() → provider is required).
    @InjectRepository(Users)
    private readonly usersRepo?: Repository<Users>,
  ) {}

  /**
   * True when the user row (source of truth) has type super_admin. Reads the row straight from
   * the DB rather than the token-resolved object, so a stale/forged `type` on the request can
   * never escalate. No DB hit for a missing/untrusted id (returns false). `userId` must already
   * be the namespace-safe id (user client only) — see the caller-building blocks below.
   */
  private async checkSuperAdmin(userId?: number): Promise<boolean> {
    if (userId === undefined) return false;
    const profile = await this.usersRepo!.findOne({ where: { id: userId } });
    if (!profile) throw new NotFoundException(NOT_FOUND);
    return profile.type === UserType.SUPER_ADMIN;
  }

  // ── Manage-authority gate (derive grant-authority from edit + rule-verb) ─────

  /** Verb a record editor must additionally hold to create/update grants on a record. */
  private static readonly CREATE_VERB = 'perm_data_access_create';
  /** Verb a record editor must additionally hold to delete/unlink grants on a record. */
  private static readonly DELETE_VERB = 'perm_data_access_delete';

  /**
   * Gate a rule write against the record-manager rule for EVERY rule-target table.
   * A caller may only create/update/delete a rule on records they actually manage:
   *   super_admin OR own-all(table) OR editOnRecord(∧ verb) OR SO-owner(subtree).
   * `verbCode` follows the endpoint's action (create/update → CREATE_VERB,
   * delete/removeLink → DELETE_VERB) so a delete-only editor is not gated on the
   * create verb.
   *
   * No-op only when: caller is absent (internal/unscoped call) OR the table is not a
   * rule target. EVERY target dataId must be manageable (all-or-nothing) or the whole
   * write is rejected 403. Reads ownership straight from the DB (bypassCache) so an
   * editor just granted access is not blocked by a stale cache entry.
   */
  private async enforceManageGate(
    caller: CallerContext | undefined,
    tableName: string | undefined,
    dataIds: number[],
    verbCode: string,
  ): Promise<void> {
    if (!caller) return;
    if (!tableName || !RULE_TARGET_TABLES.has(tableName)) return;
    if (caller.isSuperAdmin) return;

    // Whole-table SO: the sentinel resource_owners row never matches a real record in the
    // owner join (so isInOwnedScope can't see it), so resolve own-all explicitly here —
    // mirrors the records-browser scope (getScopedRecords): a sentinel owner manages every
    // row, a non-owner none. Terminal on purpose — own-all tables have no per-record editor
    // model today. If such a table ever grows an edit ('update') permission, fall through to
    // filterManageableRecords instead of throwing so record editors are not falsely blocked.
    if (OWNER_ALL_TABLES.has(tableName)) {
      const roleRows: { role_id: number }[] = await this.connection.query(
        'SELECT role_id FROM user_roles WHERE user_id = $1 AND deleted_at IS NULL',
        [caller.userId],
      );
      const roleIds = roleRows.map((r) => r.role_id);
      if (await this.hasOwnerAllAssignment(tableName, roleIds)) return;
      throw new ForbiddenException('not_record_manager');
    }

    // Resolve the editable/owned set once (batched), then require EVERY target record to be
    // manageable (all-or-nothing). bypassCache so a just-granted editor is not blocked.
    const manageable = new Set(
      await this.manageAuthority.filterManageableRecords(caller, tableName, dataIds, verbCode, {
        bypassCache: true,
      }),
    );
    if (dataIds.some((id) => !manageable.has(id))) {
      throw new ForbiddenException('not_record_manager');
    }
  }

  /**
   * SQL membership branches for the caller's edit-accessible records on manage-enabled
   * tables, gated on `verbCode`. Each branch is `(m.table_name = '<t>' AND da.data_id IN (<ids>))`.
   * Table names come from the static MANAGE_ENABLED_MODULES set and ids are integers, so the
   * fragment carries no bind params — the caller's existing $N offsets stay valid.
   */
  private async buildManageEditBranches(caller: CallerContext, verbCode: string): Promise<string[]> {
    const branches: string[] = [];
    for (const tableName of MANAGE_ENABLED_MODULES) {
      const ids = await this.manageAuthority.getEditAccessibleRecordIds(caller, tableName, verbCode);
      const safe = ids.filter((id) => Number.isInteger(id));
      if (safe.length) branches.push(`(m.table_name = '${tableName}' AND da.data_id IN (${safe.join(',')}))`);
    }
    return branches;
  }

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
  async list(
    dto: SearchDataAccessDto,
    sortParams: SortParams,
    pagination: PaginationParams,
    user?: { id?: unknown },
    client?: string,
  ) {
    // Resolve the caller once. Both user & client absent = internal caller (no HTTP context).
    // userId is namespace-safe: trusted only for the user client (see checkSuperAdmin).
    const rawId = Number(user?.id);
    const userId = client === (USER_CLIENT.USER as string) && Number.isInteger(rawId) && rawId > 0 ? rawId : undefined;
    const caller: CallerContext | undefined =
      user || client ? { userId, client, isSuperAdmin: await this.checkSuperAdmin(userId) } : undefined;

    // "Unscoped" = sees every record, no owner filter — covers internal callers AND
    // super_admin (the admin-sees-all rule). A normal user is scoped below to the records
    // they own (via roles) OR may edit (manage-enabled tables, per the manage rule).
    const isUnscoped = !caller || caller.isSuperAdmin;

    // Scoped path: resolve owner scope via accessible CTE
    let ownerCtePrefix = '';
    let ownerWhereClause = '';
    let ownerParams: any[] = [];

    if (!isUnscoped) {
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

      const roleRows: { role_id: number }[] = await this.connection.query(
        'SELECT role_id FROM user_roles WHERE user_id = $1 AND deleted_at IS NULL',
        [caller.userId],
      );
      const roleIds = roleRows.map((r) => r.role_id);

      // Additive edit-scope (manage-enabled tables): a record editor holds a
      // record-scoped user grant, not a role grant, so their records never appear via
      // the role-driven owner CTE. Surface them as an extra membership branch, gated on
      // the view-verb. Inline integer ids (never params) keep the caller's $N offsets valid.
      const editBranches = await this.buildManageEditBranches(caller, 'perm_data_access_view');

      const membership: string[] = [];
      if (roleIds.length) {
        ownerParams = [roleIds];
        const { cteSql } = buildAccessibleCTE('$1');
        ownerCtePrefix = `accessible AS (\n${cteSql}\n)`;
        membership.push(`(m.table_name, da.data_id) IN (SELECT table_name, data_id FROM accessible)`);
      }
      membership.push(...editBranches);

      // No roles AND no edit-accessible records → nothing is visible to this caller.
      if (!membership.length) return emptyResult;

      ownerWhereClause = ` AND (${membership.join(' OR ')})`;
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

  async create(dto: CreateDataAccessDto, performedBy = 'system', user?: { id?: unknown }, client?: string) {
    const rawId = Number(user?.id);
    const userId = client === (USER_CLIENT.USER as string) && Number.isInteger(rawId) && rawId > 0 ? rawId : undefined;
    const caller: CallerContext | undefined =
      user || client ? { userId, client, isSuperAdmin: await this.checkSuperAdmin(userId) } : undefined;
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

    // Manage-authority gate (before any mutation): the caller must be able to manage every
    // target record (all-or-nothing) on any rule-target table.
    await this.enforceManageGate(caller, mod.table_name, dto.data_ids, DataAccessService.CREATE_VERB);

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
  async update(id: number, dto: UpdateDataAccessDto, performedBy = 'system', user?: { id?: unknown }, client?: string) {
    const rawId = Number(user?.id);
    const userId = client === (USER_CLIENT.USER as string) && Number.isInteger(rawId) && rawId > 0 ? rawId : undefined;
    const caller: CallerContext | undefined =
      user || client ? { userId, client, isSuperAdmin: await this.checkSuperAdmin(userId) } : undefined;
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

    // Manage-authority gate: caller must manage the record this rule targets.
    await this.enforceManageGate(caller, tableName, [old.data_id], DataAccessService.CREATE_VERB);

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

  async delete(id: number, performedBy = 'system', user?: { id?: unknown }, client?: string) {
    const rawId = Number(user?.id);
    const userId = client === (USER_CLIENT.USER as string) && Number.isInteger(rawId) && rawId > 0 ? rawId : undefined;
    const caller: CallerContext | undefined =
      user || client ? { userId, client, isSuperAdmin: await this.checkSuperAdmin(userId) } : undefined;
    const record = await this.dataAccessRepository.findOne({
      where: { id },
      relations: ['module', 'role_data_access', 'role_data_access.role', 'user_data_access', 'user_data_access.user'],
    });
    if (!record) throw new NotFoundException(NOT_FOUND);

    const tableName = record.module?.table_name;

    // Manage-authority gate: caller must manage the record this rule targets.
    await this.enforceManageGate(caller, tableName, [record.data_id], DataAccessService.DELETE_VERB);

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
  async removeLink(
    ruleId: number,
    subjectType: 'role' | 'user',
    subjectId: number,
    performedBy = 'system',
    user?: { id?: unknown },
    client?: string,
  ) {
    const rawId = Number(user?.id);
    const userId = client === (USER_CLIENT.USER as string) && Number.isInteger(rawId) && rawId > 0 ? rawId : undefined;
    const caller: CallerContext | undefined =
      user || client ? { userId, client, isSuperAdmin: await this.checkSuperAdmin(userId) } : undefined;

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

    // Manage-authority gate: caller must manage the record this rule targets.
    await this.enforceManageGate(caller, tableName, [record.data_id], DataAccessService.DELETE_VERB);

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

  // ── Handover (transfer edit grant A → B) ─────────────────────────────────────

  /**
   * Hand a record's edit (RUD) grant from user A to user B atomically. Because manage
   * authority is derived from the edit grant, transferring edit transfers grant-authority.
   * Third-party rules on the same record (incl. rules A previously created for others) are
   * left intact — only A's own record-scoped RUD grant moves. All records move in a single
   * transaction (all-or-nothing).
   *
   * Auth: caller must be able to manage EVERY target record (canManageRecord folds
   * super_admin/SO + editOnRecord∧create-verb). Only enabled for MANAGE_ENABLED_MODULES.
   */
  async handover(dto: HandoverDataAccessDto, performedBy = 'system', user?: { id?: unknown }, client?: string) {
    const rawId = Number(user?.id);
    const userId = client === (USER_CLIENT.USER as string) && Number.isInteger(rawId) && rawId > 0 ? rawId : undefined;
    const caller: CallerContext | undefined =
      user || client ? { userId, client, isSuperAdmin: await this.checkSuperAdmin(userId) } : undefined;
    const { module_id, data_ids, from_user_id, to_user_id } = dto;

    if (from_user_id === to_user_id) throw new BadRequestException('cannot_handover_to_self');

    const mod = await this.resolveModule(module_id);
    if (!isManageEnabledTable(mod.table_name)) throw new BadRequestException('handover_not_enabled_for_table');

    // Recipient must be a live, active user.
    const toRows: { id: number }[] = await this.connection.query(
      'SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL AND is_deleted IS NOT TRUE AND status = $2 LIMIT 1',
      [to_user_id, USER_STATUS.ACTIVE],
    );
    if (!toRows.length) throw new BadRequestException('target_user_invalid');

    // Authorize the caller against every record before mutating anything.
    if (caller) {
      for (const dataId of data_ids) {
        const ok = await this.manageAuthority.canManageRecord(
          caller,
          mod.table_name,
          dataId,
          DataAccessService.CREATE_VERB,
          { bypassCache: true },
        );
        if (!ok) throw new ForbiddenException('not_record_manager');
      }
    }

    await this.connection.transaction(async (manager) => {
      for (const dataId of data_ids) {
        await this.grantEditToUser(manager, mod, dataId, to_user_id);
        await this.stripUserEditGrant(manager, mod.id, dataId, from_user_id);
      }
    });

    // Both users' record access changed; table-wide cache entries also go stale.
    this.permissionCache.invalidateUser(from_user_id).catch(() => {});
    this.permissionCache.invalidateUser(to_user_id).catch(() => {});
    this.permissionCache.invalidateByTable(mod.table_name).catch(() => {});

    this.historyLogger
      .log({
        entity_type: CHANGE_ENTITY_TYPE.DATA_ACCESS,
        action_type: CHANGE_ACTION_TYPE.UPDATE,
        entity_id: data_ids.join(','),
        entity_name: mod.table_name,
        performed_by: performedBy,
        old_value: { from_user_id, data_ids, table_name: mod.table_name },
        new_value: { to_user_id, data_ids, table_name: mod.table_name },
      })
      .catch(() => {});

    return { module_id, data_ids, from_user_id, to_user_id };
  }

  /**
   * Grant `userId` the record-scoped RUD edit set on (mod, dataId) — a fresh creator-shaped
   * grant (dedicated DataAccess + one UserDataAccess per RUD permission). Must run inside a
   * transaction manager. No-op when the module has no RUD permissions.
   */
  private async grantEditToUser(
    manager: EntityManager,
    mod: ModuleEntity,
    dataId: number,
    userId: number,
  ): Promise<void> {
    const permissions = await manager.find(Permission, {
      where: { module_id: mod.id, action: In(CREATOR_ACTIONS), is_active: true, deleted_at: IsNull() },
    });
    if (!permissions.length) return;

    const saved = await manager.save(
      manager.create(DataAccess, { data_id: dataId, module_id: mod.id, scope_type: SCOPE_TYPE.ALLOW }),
    );
    await manager.insert(
      UserDataAccess,
      permissions.map((p) => ({ user_id: userId, data_access_id: saved.id, permission_id: p.id })),
    );
  }

  /**
   * Soft-delete `userId`'s record-scoped RUD grants on (moduleId, dataId), leaving every other
   * subject's rules untouched. A rule left with no active junction is soft-deleted too
   * (mirrors removeLink). Must run inside a transaction manager.
   */
  private async stripUserEditGrant(
    manager: EntityManager,
    moduleId: number,
    dataId: number,
    userId: number,
  ): Promise<void> {
    const rules = await manager.find(DataAccess, {
      where: { data_id: dataId, module_id: moduleId, scope_type: SCOPE_TYPE.ALLOW, deleted_at: IsNull() },
      relations: ['user_data_access', 'user_data_access.permission', 'role_data_access'],
    });

    for (const rule of rules) {
      const toRemove = (rule.user_data_access || []).filter(
        (u) => u.user_id === userId && !u.deleted_at && CREATOR_ACTIONS.includes(u.permission?.action),
      );
      if (!toRemove.length) continue;

      const removedIds = new Set(toRemove.map((u) => u.id));
      await manager.softDelete(UserDataAccess, { id: In([...removedIds]) });

      const remainingUsers = (rule.user_data_access || []).filter((u) => !u.deleted_at && !removedIds.has(u.id)).length;
      const remainingRoles = (rule.role_data_access || []).filter((r) => !r.deleted_at).length;
      if (remainingUsers === 0 && remainingRoles === 0) {
        await manager.softDelete(DataAccess, { id: rule.id });
      }
    }
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

  async getRecords(
    tableName: string,
    dto: SearchRecordsDto,
    pagination: PaginationParams,
    user?: { id?: unknown },
    client?: string,
  ) {
    // Records browser allows browsing any ALLOWED_TABLES member (leaf tables inherit
    // scope but are still browsable); only rule creation is gated by RULE_TARGET_TABLES.
    if (!ALLOWED_TABLES.has(tableName)) {
      throw new BadRequestException('table_not_allowed');
    }

    const rawId = Number(user?.id);
    const userId = client === (USER_CLIENT.USER as string) && Number.isInteger(rawId) && rawId > 0 ? rawId : undefined;
    const caller: CallerContext | undefined =
      user || client ? { userId, client, isSuperAdmin: await this.checkSuperAdmin(userId) } : undefined;

    // Unscoped (no user context — internal callers): return all records.
    if (!caller) return this.getUnscopedRecords(tableName, dto, pagination);

    // super_admin sees every row on any table (admin-sees-all rule, consistent with the
    // grouped list path). Resolved before scope branching so it applies to owner-scoped and
    // own-all tables too, not just manage-enabled ones.
    if (caller.isSuperAdmin) return this.getUnscopedRecords(tableName, dto, pagination);

    // Manage-enabled tables (excluding own-all) scope by editOnRecord ∧ create-verb
    // (plus SO owned). Other tables keep the prior owner-scope path.
    if (isManageEnabledTable(tableName) && !OWNER_ALL_TABLES.has(tableName)) {
      return this.getManageScopedRecords(tableName, dto, pagination, caller);
    }

    return this.getScopedRecords(tableName, dto, pagination, caller);
  }

  /**
   * Records-browser scope for a manage-enabled table: the union of
   *   • edit-accessible rows (explicit record-scoped grant ∧ create-verb), and
   *   • SO-owned rows (the caller's roles own the row's subtree via the owner chain).
   * super_admin is handled upstream in getRecords (admin-sees-all); callers here are always
   * non-admin.
   *
   * The two access paths are unioned and paginated entirely in SQL. Edit grants are explicit
   * (bounded) so they stay an id allow-list; owner scope is a correlated EXISTS over the owner
   * join, NOT a materialized id list — an owner of a large subtree could own tens of thousands
   * of rows, so LIMIT/OFFSET must push into Postgres rather than loading every owned id into
   * memory first. Empty grant set and no owner scope → empty page (no query).
   */
  private async getManageScopedRecords(
    tableName: string,
    dto: SearchRecordsDto,
    pagination: PaginationParams,
    caller: CallerContext,
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
    if (caller.userId === undefined) return emptyResult;

    // Explicit edit grants (bounded) and the caller's active roles (for owner scope), in parallel.
    const [editIdsRaw, roleRows] = await Promise.all([
      this.manageAuthority.getEditAccessibleRecordIds(caller, tableName, 'perm_data_access_create'),
      this.connection.query<{ role_id: number }[]>(
        'SELECT role_id FROM user_roles WHERE user_id = $1 AND deleted_at IS NULL',
        [caller.userId],
      ),
    ]);
    const editIds = editIdsRaw.filter((id) => Number.isInteger(id));
    const roleIds = roleRows.map((r) => r.role_id);
    const canOwnerScope = roleIds.length > 0 && !!buildOwnerJoinChain(tableName, '$1');

    // Neither access path can match → nothing to browse (skip the queries entirely).
    if (!editIds.length && !canOwnerScope) return emptyResult;

    const nameCol = getNameColumn(tableName);
    const params: any[] = [];
    const branches: string[] = [];

    if (editIds.length) {
      params.push(editIds);
      branches.push(`m.id = ANY($${params.length})`);
    }
    const ownerChain = canOwnerScope ? buildOwnerJoinChain(tableName, `$${params.length + 1}`) : null;
    if (ownerChain) {
      params.push(roleIds);
      // Correlated EXISTS keeps owner scope in-DB: the owner join filters to the caller's roles
      // and correlates back to the outer row, so pagination stays on the outer query.
      branches.push(`EXISTS (SELECT 1 FROM "${tableName}" t0 ${ownerChain.joinSQL} AND t0.id = m.id)`);
    }

    let whereClause = `WHERE m.deleted_at IS NULL AND m.is_deleted IS NOT TRUE AND (${branches.join(' OR ')})`;

    if (dto.keyword) {
      params.push(`%${dto.keyword}%`);
      whereClause += ` AND (CAST(m.id AS TEXT) ILIKE $${params.length} OR CAST(m.${nameCol} AS TEXT) ILIKE $${params.length})`;
    }
    if (dto.date_from) {
      params.push(dto.date_from);
      whereClause += ` AND m.created_at >= $${params.length}`;
    }
    if (dto.date_to) {
      params.push(dto.date_to);
      whereClause += ` AND m.created_at <= $${params.length}`;
    }

    const countQuery = `SELECT COUNT(*)::int as total FROM "${tableName}" m ${whereClause}`;
    const countResult = await this.connection.query<{ total: number }[]>(countQuery, params);
    const total: number = countResult[0]?.total || 0;

    params.push(pagination.limit, pagination.skip || 0);
    const dataQuery = `SELECT m.id, m.${nameCol} as display_name, m.created_at FROM "${tableName}" m ${whereClause} ORDER BY m.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
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

  /**
   * List every candidate record (id + display_name + created_at), filtered by
   * keyword/date. Serves two callers with the same "browse all rows" semantics:
   * internal unscoped callers, and admins picking grant candidates for an
   * explicit-only table. Record-level access is enforced elsewhere (assignment
   * mutation stays permission-gated); this is a picker, not a data endpoint.
   */
  private async getUnscopedRecords(
    tableName: string,
    dto: SearchRecordsDto,
    pagination: PaginationParams,
    restrictIds?: number[],
  ) {
    const nameCol = getNameColumn(tableName);
    const params: any[] = [];
    // Dual-column deleted check: is_deleted flagged OR deleted_at set.
    let whereClause = 'WHERE deleted_at IS NULL AND is_deleted IS NOT TRUE';

    // Optional id allow-list: restricts the picker to a precomputed candidate set
    // (manage-scoped browser). Empty array short-circuits upstream, so length > 0 here.
    if (restrictIds) {
      params.push(restrictIds);
      whereClause += ` AND id = ANY($${params.length})`;
    }

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
