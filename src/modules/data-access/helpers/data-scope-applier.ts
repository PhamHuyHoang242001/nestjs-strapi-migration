import { SelectQueryBuilder } from 'typeorm';
import { HIERARCHY_MAP } from '../constants/hierarchy-config';
import type { DataScope } from '@common/authorization/types/data-scope.types';

/**
 * Predicate-pushdown helper. Emits the WHERE clause that scopes a query
 * to records the user has access to: `explicit OR owner_branch`.
 *
 * Owner branch is additive and immune to record-level deny — deny rules are
 * subtracted from `explicit` upstream in `getAccessibleRecords()`.
 * Owner branch uses an `EXISTS` subquery walking HIERARCHY_MAP from the
 * target table up to its hierarchy root. PG planner rewrites EXISTS into a
 * semi-join with the FK index, so wire/bind cost stays O(|rootIds|) instead
 * of the unbounded O(leaf records) that flattened-IN-list patterns produced.
 *
 * `scope === null` → admin path, no-op.
 */
export function applyDataScope<T>(
  qb: SelectQueryBuilder<T>,
  rootAlias: string,
  tableName: string,
  scope: DataScope | null,
): void {
  if (scope === null) return;

  const hasExplicit = scope.explicit.length > 0;

  if (!hasExplicit && scope.ownedRoots === null) {
    qb.andWhere('1 = 0');
    return;
  }

  const suffix = randomSuffix();
  const ors: string[] = [];

  if (hasExplicit) {
    const param = `dsExplicit_${suffix}`;
    qb.setParameter(param, [...scope.explicit]);
    ors.push(`${rootAlias}.id = ANY(:${param})`);
  }

  if (scope.ownedRoots !== null) {
    const { rootTable, rootIds } = scope.ownedRoots;
    const chain = walkUp(tableName, rootTable);
    if (chain !== null) {
      const param = `dsOwned_${suffix}`;
      qb.setParameter(param, [...rootIds]);
      if (chain.length === 0) {
        // tableName === rootTable: target IS the root, no JOIN needed.
        ors.push(`${rootAlias}.id = ANY(:${param})`);
      } else {
        ors.push(buildExistsSubquery(rootAlias, chain, suffix, param));
      }
    }
    // chain === null → tableName not in HIERARCHY_MAP or unreachable.
    // Drop the owner branch. Falls back to explicit-only, or 1=0 below.
  }

  if (ors.length === 0) {
    qb.andWhere('1 = 0');
    return;
  }

  qb.andWhere(`(${ors.join(' OR ')})`);
}

// ── internals ────────────────────────────────────────────────────────────────

interface ChainHop {
  childTable: string;
  parentTable: string;
  fkColumn: string;
}

/**
 * Walk HIERARCHY_MAP upward from `tableName` until reaching `rootTable`.
 * Returns the chain of hops, or `null` if `rootTable` is unreachable.
 * `chain.length === 0` ⇔ `tableName === rootTable`.
 *
 * The 10-hop guard prevents an infinite loop if HIERARCHY_MAP is ever
 * misconfigured with a cycle. Current map depth is 3.
 */
function walkUp(tableName: string, rootTable: string): ChainHop[] | null {
  if (tableName === rootTable) return [];

  const chain: ChainHop[] = [];
  let cursor = tableName;
  for (let i = 0; i < 10; i++) {
    const entry = HIERARCHY_MAP[cursor];
    if (!entry) return null; // unknown table or premature root
    chain.push({ childTable: cursor, parentTable: entry.parentTable, fkColumn: entry.fkColumn });
    if (entry.parentTable === rootTable) return chain;
    cursor = entry.parentTable;
  }
  return null; // depth exceeded — likely cycle
}

function buildExistsSubquery(rootAlias: string, chain: ChainHop[], suffix: string, paramName: string): string {
  // chain[0] is the hop OUT of the target table; chain[chain.length-1].parentTable === rootTable.
  const aliases = chain.map((_, i) => `__ds_t${i + 1}_${suffix}`);
  const lines: string[] = ['EXISTS ('];
  lines.push('  SELECT 1');

  chain.forEach((hop, i) => {
    if (i === 0) {
      lines.push(`  FROM "${hop.parentTable}" ${aliases[i]}`);
    } else {
      // Dual-column deleted check (is_deleted flagged OR deleted_at set) — both
      // columns live on every ALLOWED_TABLES row; two delete paths set only one.
      lines.push(
        `  INNER JOIN "${hop.parentTable}" ${aliases[i]} ON ${aliases[i]}.id = ${aliases[i - 1]}."${hop.fkColumn}" AND ${aliases[i]}.deleted_at IS NULL AND ${aliases[i]}.is_deleted IS NOT TRUE`,
      );
    }
  });

  lines.push(`  WHERE ${aliases[0]}.id = ${rootAlias}."${chain[0].fkColumn}"`);
  // Dual-column deleted check on the first hop's row too.
  lines.push(`    AND ${aliases[0]}.deleted_at IS NULL AND ${aliases[0]}.is_deleted IS NOT TRUE`);
  lines.push(`    AND ${aliases[aliases.length - 1]}.id = ANY(:${paramName})`);
  lines.push(')');

  return lines.join('\n');
}

function randomSuffix(): string {
  // 8-char base36 suffix. Collision probability is negligible for the
  // number of helper calls per request; param naming only — not a
  // security boundary.
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0');
}
