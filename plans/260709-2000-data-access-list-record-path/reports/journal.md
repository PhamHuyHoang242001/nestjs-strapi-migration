# Journal — Plan created: data-access list record_path

**Date:** 2026-07-09
**Plan:** `plans/260709-2000-data-access-list-record-path/`
**From brainstorm:** `plans/brainstorm-data-access-list-record-path/brainstorm-summary.md`

## What
Plan to add `record_path` (root→leaf, `/`-separated names) to `GET /v1/data-access/list` + `details/:id`. New `RecordPathService` walks `HIERARCHY_MAP` up to root, name per level via `getNameColumn()` (fallback `ID:<id>`). Additive field — `module_path` + `record_name` unchanged.

## Decisions locked
- Path root→leaf, `/`-separated, includes root.
- Endpoints: list + details.
- Name missing → NAME_COLUMN_MAP then `ID:<id>`.
- Approach A: app walk per-record (KISS, ≤250 queries worst-case).
- 4 phases: RecordPathService TDD → wire list → wire details → tests+typecheck.

## Touchpoints
- NEW `services/record-path.service.ts` + spec.
- MOD `data-access.service.ts` (inject + list/details attach), `data-access.module.ts` (provider).
- Reuse 100%: HIERARCHY_MAP, NAME_COLUMN_MAP, getNameColumn, ALLOWED_TABLES. No migration, no schema change.

## Next
`/ck:cook` after plan approval.
