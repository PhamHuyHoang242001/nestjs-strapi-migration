import { HIERARCHY_MAP, ALLOWED_TABLES, ROOT_OWNER_CONFIG } from '../constants/hierarchy-config';

/**
 * Walk HIERARCHY_MAP upward from tableName until a root entry (null) is found.
 * Returns the root table name, or null if tableName is unknown.
 */
export function findRootTable(tableName: string): string | null {
  if (!(tableName in HIERARCHY_MAP)) return null;

  let current = tableName;
  while (HIERARCHY_MAP[current] !== null && HIERARCHY_MAP[current] !== undefined) {
    current = HIERARCHY_MAP[current].parentTable;
  }
  return current;
}

/**
 * Build a SQL JOIN chain from the target table up to the root, then to resource_owners.
 * Returns { joinSQL, rootTable } or null if the root has no ROOT_OWNER_CONFIG.
 *
 * The target table is aliased as "t0" — caller must use "t0" in their SELECT.
 * Parent tables are aliased t1, t2, etc. The junction is aliased "ro".
 */
export function buildOwnerJoinChain(
  tableName: string,
  roleIdsParam: string,
): { joinSQL: string; rootTable: string } | null {
  const rootTable = findRootTable(tableName);
  if (!rootTable) return null;

  const ownerConfig = ROOT_OWNER_CONFIG[rootTable];
  if (!ownerConfig) return null;

  // Build the chain from target up to root
  const chain: { childTable: string; parentTable: string; fkColumn: string }[] = [];
  let current = tableName;
  while (HIERARCHY_MAP[current] !== null && HIERARCHY_MAP[current] !== undefined) {
    const entry = HIERARCHY_MAP[current];
    chain.push({ childTable: current, parentTable: entry.parentTable, fkColumn: entry.fkColumn });
    current = entry.parentTable;
  }

  // Build JOIN SQL
  const joins: string[] = [];
  for (let i = 0; i < chain.length; i++) {
    const childAlias = i === 0 ? 't0' : `t${i}`;
    const parentAlias = `t${i + 1}`;
    const { parentTable, fkColumn } = chain[i];
    joins.push(
      `JOIN "${parentTable}" ${parentAlias} ON ${parentAlias}.id = ${childAlias}."${fkColumn}" AND ${parentAlias}.deleted_at IS NULL`,
    );
  }

  // Join to polymorphic resource_owners table
  const rootAlias = chain.length === 0 ? 't0' : `t${chain.length}`;
  const { resourceType } = ownerConfig;
  joins.push(
    `JOIN "resource_owners" ro ON ro.resource_id = ${rootAlias}.id AND ro.resource_type = '${resourceType}' AND ro.deleted_at IS NULL`,
  );

  // Add WHERE for role_ids
  joins.push(`WHERE ro.role_id = ANY(${roleIdsParam})`);

  return { joinSQL: joins.join('\n'), rootTable };
}

/**
 * Build a CTE that lists all accessible (data_id, table_name) pairs for tables
 * whose root has a ROOT_OWNER_CONFIG entry.
 *
 * Used by list() to scope results across multiple tables in a single query.
 */
export function buildAccessibleCTE(roleIdsParam: string): { cteSql: string } {
  const branches: string[] = [];

  for (const tableName of ALLOWED_TABLES) {
    const rootTable = findRootTable(tableName);
    if (!rootTable) continue;

    const ownerConfig = ROOT_OWNER_CONFIG[rootTable];
    if (!ownerConfig) continue;

    // Build JOIN chain from this table to root
    const chain: { parentTable: string; fkColumn: string }[] = [];
    let current = tableName;
    while (HIERARCHY_MAP[current] !== null && HIERARCHY_MAP[current] !== undefined) {
      const entry = HIERARCHY_MAP[current];
      chain.push({ parentTable: entry.parentTable, fkColumn: entry.fkColumn });
      current = entry.parentTable;
    }

    // Build the SELECT branch
    const aliases = ['t0'];
    const joins: string[] = [];

    for (let i = 0; i < chain.length; i++) {
      const childAlias = aliases[i];
      const parentAlias = `t${i + 1}`;
      aliases.push(parentAlias);
      joins.push(
        `JOIN "${chain[i].parentTable}" ${parentAlias} ON ${parentAlias}.id = ${childAlias}."${chain[i].fkColumn}" AND ${parentAlias}.deleted_at IS NULL`,
      );
    }

    const rootAlias = aliases[aliases.length - 1];
    const { resourceType } = ownerConfig;
    joins.push(
      `JOIN "resource_owners" ro ON ro.resource_id = ${rootAlias}.id AND ro.resource_type = '${resourceType}' AND ro.deleted_at IS NULL`,
    );

    const branch = `SELECT t0.id as data_id, '${tableName}' as table_name FROM "${tableName}" t0 ${joins.join(' ')} WHERE ro.role_id = ANY(${roleIdsParam}) AND t0.deleted_at IS NULL`;
    branches.push(branch);
  }

  return { cteSql: branches.join('\nUNION ALL\n') };
}
