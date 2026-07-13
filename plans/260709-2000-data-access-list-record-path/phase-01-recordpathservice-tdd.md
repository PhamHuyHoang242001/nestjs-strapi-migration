---
phase: 1
title: "RecordPathService TDD"
status: pending
priority: P2
effort: "3h"
dependencies: []
---

# Phase 1: RecordPathService TDD

## Overview
New `RecordPathService` walks `HIERARCHY_MAP` from a leaf (tableName, id) up to root, fetching each level's display name via `getNameColumn()`, and joins root→leaf with ` / `. TDD: specs first (path shape, fallback, depth guard), then implement.

## Requirements
- Functional:
  - `buildPath(tableName: string, leafId: number): Promise<string>` returns root→leaf `/`-joined names.
  - Walk: read child row → push name → read `HIERARCHY_MAP[table].fkColumn` → jump to parent → repeat until entry null (root).
  - Name missing (column null / row soft-deleted / row gone) → fallback `ID: <id>`; if row gone mid-chain → stop chain (return collected so far).
  - Depth guard ≤8 hops (cycle/malformed FK).
  - `tableName` not in `ALLOWED_TABLES` → return `ID: <leafId>`.
- Non-functional:
  - Reuse `HIERARCHY_MAP`, `getNameColumn`, `ALLOWED_TABLES` from hierarchy-config — no new config.
  - File <120 lines.
  - DB-mocked specs (DataSource.query mocked) asserting emitted SQL + return path.

## Architecture
- `RecordPathService` `@Injectable()` with `DataSource` dep.
- `fetchRow(table, id, nameCol)`: `SELECT id, "<nameCol>" as display_name FROM "<table>" WHERE id=$1 AND deleted_at IS NULL` → row|null.
- `fetchParentId(table, id, fkCol)`: `SELECT "<fkCol>" as parentId FROM "<table>" WHERE id=$1 AND deleted_at IS NULL` → number|null.
- Loop: cur=leaf; while allowed + guard: fetchRow → push {table,id,name}; entry=HIERARCHY_MAP[cur]; if null break; parentId=fetchParentId; if null break; cur=parentTable, curId=parentId.
- Return `chain.reverse().map(c=>c.name).join(' / ')`.

## Related Code Files
- Create: `src/modules/data-access/services/record-path.service.ts`
- Create: `src/modules/data-access/services/__tests__/record-path.service.spec.ts`
- Read: `src/modules/data-access/constants/hierarchy-config.ts` (HIERARCHY_MAP, getNameColumn, ALLOWED_TABLES)

## Implementation Steps
1. Write spec: bi_hub_reports 2-level path (`BICC / Report`); bi_payment_documents 4-level; root-only (ma_tool_cstb_rpt_properties) single-level; disallowed table → `ID:`; row-gone mid-chain → partial + stop; depth guard; name null → `ID: <id>`.
2. Mock DataSource.query to return scripted rows per call.
3. Implement `RecordPathService.buildPath` + private helpers.
4. Run spec green.

## Success Criteria
- [x] buildPath returns root→leaf `/`-joined names.
- [x] Fallback `ID: <id>` on null name / missing row.
- [x] Disallowed table → `ID: <leafId>`.
- [x] Depth guard stops ≤8 hops.
- [x] Root-only table → single-level.
- [x] Spec passes; file <120 lines.

## Risk Assessment
- Mocking query call sequence (fetchRow then fetchParentId per level) — spec must script returns in order. Mirror document step-scope spec mock pattern.
- FK direction: verify `bi_payment_other_files.bi_payment_checklist_id` walks other_file→checklist (child→parent). ✓
