# Journal — data-access list/details record_path

**Date:** 2026-07-09
**Plan:** `plans/260709-2000-data-access-list-record-path/`
**Brainstorm:** `plans/brainstorm-data-access-list-record-path/brainstorm-summary.md`

## What
Added `record_path` (root→leaf, `/`-separated display names) to `GET /v1/data-access/list` + `details/:id`. New `RecordPathService` walks `HIERARCHY_MAP` leaf→root, name per level via `getNameColumn()` (fallback `ID:<id>`). Additive field — `module_path` + `record_name` unchanged.

## Why
list/details returned `module_path` (modules.path text) + `record_name` (leaf name) but no full breadcrumb (e.g. `BICC-Finance / Q1-Revenue`). UI needed the tree path.

## How
- `RecordPathService.buildPath(tableName, leafId)`: loop leaf→parent via `HIERARCHY_MAP[table].fkColumn` (child's column → parent.id); per level fetch name (`getNameColumn`, fallback `id`); reverse chain → join ` / `. Depth guard ≤8 (cycle backstop). Disallowed table → `ID:<id>`.
- list: `Promise.all(groups.map(buildPath))` + per-record `.catch(() => ID:<id>)` isolation; attach `record_path` to each group.
- details: single buildPath + catch; attach alongside `record_info`.
- Reuse 100%: `HIERARCHY_MAP`, `NAME_COLUMN_MAP`, `getNameColumn`, `ALLOWED_TABLES`. No migration, no schema change.
- Postgres lowercases unquoted aliases → `as parentid` (not parentId).

## Edge cases (verified)
- Whole-table SO root (`ma_tool_cstb_rpt_properties`, null parent) → single-level.
- FK=0 sentinel → fetchRow finds no parent.id=0 → breaks gracefully (partial chain).
- Self-loop / cycle → depth guard caps at 8.
- Name null/whitespace → `ID:<id>` fallback.
- Row gone mid-chain → stop, return collected-so-far.

## Verification
- 8/8 record-path specs; 17/17 list; 16/16 read; 93/93 across 8 touched data-access specs.
- tsc: 0 errors in data-access (1 pre-existing creator-access `is_active` error — unrelated).
- record_path list test confirmed fails-without-fix / passes-with-fix.
- Pre-existing failures (`creator-access-grant`, `getrecords-owner-all`) confirmed unrelated (fail stashed).

## Code-review
DONE_WITH_CONCERNS → all 6 acceptance criteria met. L2 (depth-guard test coverage) closed. L1 (N+1 concurrent query fan-out) accepted in plan — monitor; batch-per-level fallback documented.

## Contracts
Response additive. `module_path`/`record_name`/`record_info`/`rules`/routes unchanged. Constructor param added to `DataAccessService` (8 specs patched — no other consumers).

## Follow-ups (non-blocking)
- L1: if list latency spikes in prod, switch `Promise.all` walk → batch-per-level.
