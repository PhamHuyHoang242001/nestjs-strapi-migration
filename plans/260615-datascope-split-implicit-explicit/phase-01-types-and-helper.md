---
phase: 1
title: Types and Helper
status: completed
priority: P1
effort: 4h
dependencies: []
---

# Phase 1: Types and Helper

## Overview

Define `DataScope` type. Write `applyDataScope()` helper in `modules/data-access/helpers/` that consumes a `TypeORM SelectQueryBuilder` + tableName + scope and emits the correct WHERE predicate using `EXISTS` subquery for owner branch. Test-first: 100% branch coverage on helper before any other phase touches it.

## Requirements

### Functional

- `DataScope` shape exports cleanly from `@common/authorization/types/data-scope.types.ts`.
- `applyDataScope(qb, alias, tableName, scope)`:
  - `scope === null` → no-op (admin path).
  - `explicit.length === 0 && ownedRoots === null` → `qb.andWhere('1 = 0')`.
  - `explicit` only → `WHERE alias.id = ANY(:dsExplicit_<suffix>)`.
  - `ownedRoots` only + `tableName === rootTable` → `WHERE alias.id = ANY(:dsOwned_<suffix>)`.
  - `ownedRoots` only + multi-hop → `WHERE EXISTS (SELECT 1 FROM ... INNER JOIN ... WHERE ...)`.
  - Both branches → `WHERE (explicit_predicate OR owned_predicate)`.
  - `denies` → append `AND alias.id <> ALL(:dsDeny_<suffix>)`.
- Param naming uses random 8-char suffix to avoid collision when helper called nested/multiple times.
- Helper does NOT mutate `scope` argument.

### Non-functional

- File `data-scope-applier.ts` ≤ 200 lines (modularization rule).
- Pure function: no side effects outside `qb`.
- TypeScript strict, no `any`.

## Architecture

### Files

```
src/common/authorization/types/data-scope.types.ts          [NEW]
src/common/authorization/index.ts                            [MODIFY: export DataScope]
src/modules/data-access/helpers/data-scope-applier.ts        [NEW]
src/modules/data-access/helpers/__tests__/data-scope-applier.spec.ts  [NEW]
```

### Type definition (final form)

```typescript
// src/common/authorization/types/data-scope.types.ts
export interface DataScope {
  /** Per-record admin grants (allow_role ∪ allow_user) − (deny_role ∪ deny_user). Bounded. */
  explicit: number[];
  /** Root IDs user owns via resource_owners. Null if no owner role for this hierarchy root. */
  ownedRoots: { rootTable: string; rootIds: number[] } | null;
  /** override_owner DENY kill-switch IDs. Bounded. Applied as AND-NOT after OR clause. */
  denies: number[];
}
```

### Helper internals

```typescript
// src/modules/data-access/helpers/data-scope-applier.ts (sketch — final ≤ 200 lines)
import { SelectQueryBuilder } from 'typeorm';
import { HIERARCHY_MAP } from '../constants/hierarchy-config';
import type { DataScope } from '@common/authorization/types/data-scope.types';

interface ChainHop { childTable: string; parentTable: string; fkColumn: string; }

function walkUp(tableName: string, rootTable: string): ChainHop[] | null {
  if (tableName === rootTable) return [];
  const chain: ChainHop[] = [];
  let cursor = tableName;
  while (HIERARCHY_MAP[cursor]) {
    const e = HIERARCHY_MAP[cursor]!;
    chain.push({ childTable: cursor, parentTable: e.parentTable, fkColumn: e.fkColumn });
    if (e.parentTable === rootTable) return chain;
    cursor = e.parentTable;
  }
  return null; // không reach được root
}

function buildExistsSubquery(rootAlias: string, chain: ChainHop[], suffix: string, paramName: string): string {
  // chain.length >= 1 invariant
  const aliases = chain.map((_, i) => `__ds_t${i + 1}_${suffix}`);
  let sql = 'EXISTS (\n  SELECT 1\n';
  chain.forEach((hop, i) => {
    if (i === 0) sql += `  FROM "${hop.parentTable}" ${aliases[i]}\n`;
    else sql += `  INNER JOIN "${hop.parentTable}" ${aliases[i]} ON ${aliases[i]}.id = ${aliases[i - 1]}."${chain[i].fkColumn}" AND ${aliases[i]}.deleted_at IS NULL\n`;
  });
  sql += `  WHERE ${aliases[0]}.id = ${rootAlias}."${chain[0].fkColumn}"\n`;
  sql += `    AND ${aliases[0]}.deleted_at IS NULL\n`;
  sql += `    AND ${aliases[aliases.length - 1]}.id = ANY(:${paramName})\n`;
  sql += ')';
  return sql;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function applyDataScope<T>(
  qb: SelectQueryBuilder<T>,
  rootAlias: string,
  tableName: string,
  scope: DataScope | null,
): void {
  if (scope === null) return;

  const noExplicit = scope.explicit.length === 0;
  const noOwned = scope.ownedRoots === null;

  if (noExplicit && noOwned) { qb.andWhere('1 = 0'); return; }

  const suffix = randomSuffix();
  const ors: string[] = [];

  if (!noExplicit) {
    const p = `dsExplicit_${suffix}`;
    qb.setParameter(p, scope.explicit);
    ors.push(`${rootAlias}.id = ANY(:${p})`);
  }

  if (!noOwned) {
    const { rootTable, rootIds } = scope.ownedRoots!;
    const chain = walkUp(tableName, rootTable);
    if (chain !== null) {
      const p = `dsOwned_${suffix}`;
      qb.setParameter(p, rootIds);
      if (chain.length === 0) ors.push(`${rootAlias}.id = ANY(:${p})`);
      else ors.push(buildExistsSubquery(rootAlias, chain, suffix, p));
    }
  }

  if (ors.length === 0) { qb.andWhere('1 = 0'); return; }
  qb.andWhere(`(${ors.join(' OR ')})`);

  if (scope.denies.length > 0) {
    const p = `dsDeny_${suffix}`;
    qb.setParameter(p, scope.denies);
    qb.andWhere(`${rootAlias}.id <> ALL(:${p})`);
  }
}
```

### Tại sao EXISTS không INNER JOIN trên main qb

- INNER JOIN trên main qb có thể nhân cardinality nếu consumer thêm join khác / dùng `getMany` với relations.
- EXISTS không thay đổi shape của main query → consumer dùng `getMany`, `getManyAndCount`, `getRawMany` đều an toàn.
- PG planner thường rewrite EXISTS thành semi-join với index → perf tương đương INNER JOIN khi có FK index.

## Related Code Files

### Create
- `src/common/authorization/types/data-scope.types.ts`
- `src/modules/data-access/helpers/data-scope-applier.ts`
- `src/modules/data-access/helpers/__tests__/data-scope-applier.spec.ts`

### Modify
- `src/common/authorization/index.ts` — export `DataScope`

## Implementation Steps (TDD)

1. **Write test file FIRST** — `data-scope-applier.spec.ts` with table-driven tests:
   - Test 1: `scope === null` → qb unchanged (assert SQL parametrized matches baseline).
   - Test 2: both empty → SQL contains `1 = 0`.
   - Test 3: explicit-only → SQL contains `r.id = ANY(:dsExplicit_*)` with correct param.
   - Test 4: owned root === tableName (`bicc-department` query, owned `bicc_department`) → `r.id = ANY(:dsOwned_*)`.
   - Test 5: owned 1-hop (`bi_hub_diagnostic_reports` with rootTable `bi_hub_bicc_departments`) → EXISTS subquery with 1 FROM no JOIN.
   - Test 6: owned 2-hop (`ma_tool_documents` with rootTable `ma_tool_workspaces`) → EXISTS with 1 FROM + 1 INNER JOIN.
   - Test 7: both branches → `(... OR EXISTS ...)`.
   - Test 8: denies append `AND r.id <> ALL(:dsDeny_*)`.
   - Test 9: tableName không thuộc HIERARCHY_MAP — `ownedRoots` cố tình set, `walkUp` returns null, predicate fallback chỉ còn explicit (hoặc 1=0 nếu explicit rỗng).
   - Test 10: param suffix unique trên 2 lần gọi liên tiếp.
2. **Run tests** → RED (helper chưa tồn tại).
3. **Create type file** + export from `index.ts`.
4. **Implement helper** theo sketch ở section Architecture.
5. **Run tests** → GREEN.
6. **Lint + tsc** → PASS.

### Test technique

Sử dụng TypeORM `createQueryBuilder` thật (in-memory không cần DB) + assert `qb.getQueryAndParameters()` để verify SQL string và params. Pattern:

```typescript
const ds = new DataSource({ type: 'postgres', entities: [], synchronize: false });
const qb = ds.createQueryBuilder().select('*').from('bi_hub_diagnostic_reports', 'r');
applyDataScope(qb, 'r', 'bi_hub_diagnostic_reports', scope);
const [sql, params] = qb.getQueryAndParameters();
expect(sql).toContain('EXISTS');
expect(sql).toMatch(/bi_hub_bicc_departments/);
expect(params).toContain(...expectedRootIds);
```

DataSource không cần connect — `getQueryAndParameters()` build SQL từ metadata only.

## Success Criteria

- [ ] `DataScope` type exports correctly.
- [ ] 10 unit tests pass, branch coverage 100% trên helper.
- [ ] Helper file ≤ 200 lines.
- [ ] No TypeScript errors, no lint errors.
- [ ] Helper pure (no `this`, no global state, only `qb` mutation).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| TypeORM API thay đổi giữa minor versions | Lock test to current version, document API surface used (`setParameter`, `andWhere`, `getQueryAndParameters`). |
| Random suffix có thể collide ở test (Math.random determinism) | Test xác nhận format match `/dsExplicit_[a-z0-9]{8}/` thay vì exact match. |
| HIERARCHY_MAP có entry sai → walkUp loop vô hạn | Loop guard: max 10 hops. Throw error nếu cycle. (Hiện tại HIERARCHY_MAP depth max = 3, verified Validation Session 1.) |
<!-- Updated: Validation Session 1 - depth correction 4 → 3 -->
