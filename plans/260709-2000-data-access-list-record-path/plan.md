---
title: "Data-access list: record path (tree-joined names)"
description: "Add `record_path` (root→leaf, `/`-separated names) to data-access list + details. New RecordPathService walks HIERARCHY_MAP up to root, fetching name per level via NAME_COLUMN_MAP (fallback ID:<id>). Reuse 100% existing config; additive field, no breaking change."
status: done
priority: P2
branch: "main"
tags: [data-access, record-path, read-api]
blockedBy: []
blocks: []
created: "2026-07-10T09:35:55.561Z"
createdBy: "ck:plan"
source: skill
---

# Data-access list: record path (tree-joined names)

## Overview
`GET /v1/data-access/list` + `details/:id` trả `module_path` (modules.path text) + `record_name` (tên lá qua NAME_COLUMN_MAP). Thiếu path nối cây root→leaf (vd `BICC-Finance / Q1-Revenue`) để UI hiển thị breadcrumb đầy đủ. Bổ sung field `record_path` — additive, giữ nguyên `module_path` + `record_name`.

## Decisions (locked via brainstorm)
- **Path shape**: root→leaf, `/`-separated.
- **Endpoints**: list + details.
- **Name missing**: `NAME_COLUMN_MAP[table]` → column null / row missing → fallback `ID: <id>`.
- **Root**: BAO GỒM root (bicc_department / workspace / whole-table SO root).
- **Approach**: app walk `HIERARCHY_MAP` per-record, reuse `getNameColumn()` + `ALLOWED_TABLES`.
- **list batching**: per-record walk (KISS). List ≤50 × depth ≤5 ≈ 250 queries — acceptable admin UI.

## Reused assets (no new config)
- `HIERARCHY_MAP` (hierarchy-config.ts:12) — parent→child + fkColumn (child's column → parent.id). Max depth ~5.
- `NAME_COLUMN_MAP` (line 70) + `getNameColumn()` (line 134) — table→display col, fallback `id` + regex guard.
- `ALLOWED_TABLES` (line 47) — whitelist guard.
- `DataSource` — already injected in DataAccessService.

## Phases
| Phase | Name | Status |
|-------|------|--------|
| 1 | [RecordPathService TDD](./phase-01-recordpathservice-tdd.md) | Done |
| 2 | [Wire list](./phase-02-wire-list.md) | Done |
| 3 | [Wire details](./phase-03-wire-details.md) | Done |
| 4 | [Tests + typecheck](./phase-04-tests-typecheck.md) | Done |

## Dependencies
- No cross-plan blocking. Builds on shipped grouped-data-access-list-api (260604).
- Touches read API only; no schema change, no migration.

## Key patterns
- `record_path` = chain of names root→leaf joined ` / `. Walk: leaf → read child.fkColumn → jump parent → repeat until `HIERARCHY_MAP[table] === null` (root). Reverse chain, join.
- FK semantics: `HIERARCHY_MAP.fkColumn` = child's column pointing to parent.id (e.g. `bi_payment_documents.program_id`, `bi_payment_programs.project_id`, `bi_payment_projects.bicc_department_id`). Walk direction verified.
- Depth guard (≤8 hops) stops malformed/cycle.
- Row soft-deleted mid-chain / missing → chain stops; collected levels joined; missing tail omitted (display-only).

## Edge cases
- Whole-table SO root (`ma_tool_cstb_rpt_properties`, `HIERARCHY_MAP=null`): single-level path.
- `bi_payment_categories` (root, null parent): single-level.
- `bi_payment_project_histories` (NAME_COLUMN_MAP=`id`): name = `ID: <id>`.
- `bi_payment_documents`: 4-level (doc→program→project→bicc).
- Name null on row → fallback `ID: <id>`.

## Risk
- list N+1 (250 queries worst-case) — monitor; switch to batch-per-level if slow (out of scope).
- FK column type assumption (int parent.id) — all HIERARCHY_MAP fkColumns are int FKs. ✓

## Out of scope
- by-user / by-role endpoints (list + details only).
- Batch-per-level optimization.
- Materialized cache column.
- Frontend.
