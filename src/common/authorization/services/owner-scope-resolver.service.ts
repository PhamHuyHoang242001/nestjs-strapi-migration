import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisAdapter } from '@common/infrastructure/redis.adapter';
import {
  OWNER_SCOPE_CACHE_TTL,
  userImpliedVerbsKey,
  userOwnerScopeKey,
} from '../constants/authorization.constant';
import {
  HIERARCHY_MAP,
  RESOURCE_TYPE_TO_ROOT_TABLE,
  ROOT_OWNER_CONFIG,
} from '@modules/data-access/constants/hierarchy-config';
import { findRootTable } from '@modules/data-access/helpers/owner-scope-helpers';
import { PermissionCacheService } from './permission-cache.service';

export interface OwnerScopeEntry {
  rootTable: string;
  rootId: number;
  resourceType: string;
  roleId: number;
}

/**
 * Resolves implicit ownership state for a user across all root-owner-configured services.
 *
 * Triplet of responsibilities:
 *   1. getUserOwnerScope        → which (root_table, root_id) records does the user own?
 *   2. getUserImpliedVerbs      → which permission codes does the user implicitly hold
 *                                  via subtree of owned roots' module trees?
 *   3. isInOwnedScope           → does a given (table, record_id) walk up to an owned root?
 *
 * Cache lives ONLY in Redis (no in-process memo). Invalidation triggered by
 * RoleService.saveOwnerAssignments and other resource_owners mutations.
 */
@Injectable()
export class OwnerScopeResolverService {
  private readonly logger = new Logger(OwnerScopeResolverService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  async getUserOwnerScope(userId: number): Promise<OwnerScopeEntry[]> {
    const key = userOwnerScopeKey(userId);

    const cached = await this.readCache<OwnerScopeEntry[]>(key);
    if (cached) return cached;

    const rows = await this.ds.query<
      { resource_type: string; resource_id: number | string; role_id: number | string }[]
    >(
      `
      SELECT ro.resource_type, ro.resource_id, ro.role_id
      FROM resource_owners ro
      INNER JOIN user_roles ur ON ur.role_id = ro.role_id AND ur.deleted_at IS NULL
      INNER JOIN role r ON r.id = ro.role_id AND r.status = 'active' AND r.deleted_at IS NULL
      WHERE ur.user_id = $1
        AND ro.deleted_at IS NULL
      `,
      [userId],
    );

    const entries: OwnerScopeEntry[] = [];
    for (const row of rows) {
      const rootTable = RESOURCE_TYPE_TO_ROOT_TABLE[row.resource_type];
      if (!rootTable) continue; // drift safety: skip rows with unknown resource_type
      entries.push({
        rootTable,
        rootId: Number(row.resource_id),
        resourceType: row.resource_type,
        roleId: Number(row.role_id),
      });
    }

    await this.writeCache(key, entries);
    return entries;
  }

  async getUserImpliedVerbs(userId: number): Promise<Set<string>> {
    const key = userImpliedVerbsKey(userId);

    const cached = await this.readCache<string[]>(key);
    if (cached) return new Set(cached);

    const scope = await this.getUserOwnerScope(userId);
    if (scope.length === 0) {
      await this.writeCache(key, []);
      return new Set();
    }

    const rootTables = Array.from(new Set(scope.map((s) => s.rootTable)));

    // Exclude root-level 'create' verb: owning a root record does not imply
    // permission to create sibling roots. Child-level 'create' (e.g. reports
    // under an owned bicc_department) remains in scope.
    const rows = await this.ds.query<{ code: string }[]>(
      `
      SELECT DISTINCT p.code AS code
      FROM modules root_mod
      INNER JOIN modules sub
              ON sub.path LIKE root_mod.path || '%'
             AND sub.deleted_at IS NULL
      INNER JOIN permission p
              ON p.module_id = sub.id
             AND p.is_active = true
             AND p.deleted_at IS NULL
      WHERE root_mod.table_name = ANY($1)
        AND root_mod.deleted_at IS NULL
        AND NOT (sub.id = root_mod.id AND p.action = 'create')
      `,
      [rootTables],
    );

    const codes = rows.map((r) => r.code);
    await this.writeCache(key, codes);
    return new Set(codes);
  }

  /**
   * Returns root IDs the user owns under `rootTable`. Cache-only — reads from the
   * already-cached `getUserOwnerScope`, no DB hit. Empty array if the user owns
   * nothing for this root. Used by predicate-pushdown helpers; the leaf-flattening
   * variant has been removed in favor of EXISTS-subquery emission downstream.
   */
  async getOwnedRoots(userId: number, rootTable: string): Promise<number[]> {
    const scope = await this.getUserOwnerScope(userId);
    return scope.filter((s) => s.rootTable === rootTable).map((s) => s.rootId);
  }

  async isInOwnedScope(userId: number, tableName: string, recordId: number): Promise<boolean> {
    if (!HIERARCHY_MAP[tableName] && !(tableName in HIERARCHY_MAP)) return false;

    const scope = await this.getUserOwnerScope(userId);
    if (scope.length === 0) return false;

    const rootTable = findRootTable(tableName);
    if (!rootTable) return false;

    const ownerConfig = ROOT_OWNER_CONFIG[rootTable];
    if (!ownerConfig) return false;

    const ownedRootIds = scope.filter((s) => s.rootTable === rootTable).map((s) => s.rootId);
    if (ownedRootIds.length === 0) return false;

    const chain: { childTable: string; parentTable: string; fkColumn: string }[] = [];
    let cursor = tableName;
    while (HIERARCHY_MAP[cursor] !== null && HIERARCHY_MAP[cursor] !== undefined) {
      const entry = HIERARCHY_MAP[cursor]!;
      chain.push({ childTable: cursor, parentTable: entry.parentTable, fkColumn: entry.fkColumn });
      cursor = entry.parentTable;
    }

    const joins: string[] = [];
    for (let i = 0; i < chain.length; i++) {
      const childAlias = i === 0 ? 't0' : `t${i}`;
      const parentAlias = `t${i + 1}`;
      const { parentTable, fkColumn } = chain[i];
      joins.push(
        `INNER JOIN "${parentTable}" ${parentAlias} ON ${parentAlias}.id = ${childAlias}."${fkColumn}" AND ${parentAlias}.deleted_at IS NULL`,
      );
    }
    const rootAlias = chain.length === 0 ? 't0' : `t${chain.length}`;

    const sql = `
      SELECT 1 AS exists
      FROM "${tableName}" t0
      ${joins.join('\n      ')}
      WHERE t0.id = $1
        AND t0.deleted_at IS NULL
        AND ${rootAlias}.id = ANY($2)
      LIMIT 1
    `;

    const rows = await this.ds.query<{ exists: number }[]>(sql, [recordId, ownedRootIds]);
    return rows.length > 0;
  }

  invalidateUser(userId: number): Promise<void> {
    return this.permissionCache.invalidateOwnerScopeUser(userId);
  }

  invalidateRole(roleId: number): Promise<void> {
    return this.permissionCache.invalidateOwnerScopeByRole(roleId);
  }

  invalidateGlobal(): Promise<void> {
    return this.permissionCache.invalidateOwnerScopeAll();
  }

  private async readCache<T>(key: string): Promise<T | null> {
    try {
      const raw = (await RedisAdapter.get(key)) as string | null;
      if (raw) return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.warn(`Redis read failed for ${key}: ${this.errorMsg(err)}`);
    }
    return null;
  }

  private async writeCache<T>(key: string, value: T): Promise<void> {
    try {
      await RedisAdapter.set(key, JSON.stringify(value), OWNER_SCOPE_CACHE_TTL);
    } catch (err) {
      this.logger.warn(`Redis write failed for ${key}: ${this.errorMsg(err)}`);
    }
  }

  private errorMsg(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try {
      return JSON.stringify(err);
    } catch {
      return 'Unknown error';
    }
  }
}
