---
phase: 1
title: "Registration & wiring"
status: completed
priority: P1
effort: "4-5h"
dependencies: []
---

# Phase 1: Registration & wiring

## Overview
Register `ma_tool_cstb_rpt_properties` across the permission/data-access config surface so it becomes an assignable, browsable, scopable table with a `view` permission — WITHOUT enabling any SO/owner-scope inheritance. Includes a physical-schema migration and an explicit-only branch for the record picker.

## Requirements
- Functional: table appears in role tree under new "MA Tool → Report" module with a single `view` permission; table is accepted AND browsable by the data_access assignment module; `DataScope` for this table resolves `explicit` only, `ownedRoots === null`.
- Non-functional: no collision on module/permission IDs; no change to existing tables' scoping behavior; physical columns required by scope SQL exist in every environment.

## Architecture
- `HIERARCHY_MAP['ma_tool_cstb_rpt_properties'] = null` → `findRootTable` returns the table itself (non-null). NOTE: the interceptor therefore still *runs* `getOwnedRoots` on every request, but it returns `[]` because no `resource_type` in `RESOURCE_TYPE_TO_ROOT_TABLE` maps to this table (it is absent from `ROOT_OWNER_CONFIG`). Result: `ownedRoots = null`, owner branch no-ops. The explicit-only guarantee rests on that mapping being absent — NOT on `HIERARCHY_MAP` value.
- Adding to `HIERARCHY_MAP` also adds the table to `ALLOWED_TABLES` (`hierarchy-config.ts:32` derives it from `Object.keys`) → assignment `create()` accepts it.
- `NAME_COLUMN_MAP['ma_tool_cstb_rpt_properties'] = 'rpt_code'` → picker/label display (nullable → falls back to `ID: <id>` at `data-access.service.ts:354,385`).
- Seeders add: module 106 "MA Tool" (root), module 107 "Report" (child), permission 113 `ma_tool_report_view`. `path` pinned to a fresh top-level namespace `/ma-tool` + `/ma-tool/report` — MUST NOT be a prefix-descendant of any owner-scoped root path (`/data-uploader/workspace`, `/bi-hub/bicc-department`) or `getUserImpliedVerbs` (`owner-scope-resolver.service.ts:96-97`, `LIKE path||'%'`) would leak `ma_tool_report_view` into those roots' owners' implied-verb set.
- **Record picker** (`getScopedRecords`): today returns `emptyResult` for any table absent from `ROOT_OWNER_CONFIG` (`data-access.service.ts` — `if (!ownerChain) return emptyResult`). Add an explicit-only branch so admins can browse candidate records to grant.
- **Physical schema**: entity extends `BaseSoftDeleteEntity` (needs `deleted_at` + `is_deleted`). Table is Strapi-origin; NO migration currently creates these columns and prod runs `synchronize:false` (`orm.config.ts:17`). Scope SQL filters `rec.deleted_at IS NULL AND rec.is_deleted IS NOT TRUE` (`permission-query.service.ts:165,172-173`) → missing columns = prod 500. Add a guarded migration.

## Related Code Files
- Modify: `src/common/enums/data-access-table.enum.ts` — add `MA_TOOL_CSTB_RPT_PROPERTIES = 'ma_tool_cstb_rpt_properties'`
- Modify: `src/modules/data-access/constants/hierarchy-config.ts` — add `HIERARCHY_MAP` + `NAME_COLUMN_MAP` entries; leave `ROOT_OWNER_CONFIG` / `RESOURCE_TYPE_TO_ROOT_TABLE` untouched
- Modify: `src/modules/data-access/data-access.service.ts` — explicit-only branch in `getScopedRecords`
- Modify: `src/seeders/module.seeder.ts` — MA Tool + Report module rows (full shape)
- Modify: `src/seeders/permission.seeder.ts` — `ma_tool_report_view` (full shape incl. `name`)
- Create: `src/migration/<ts>-add-soft-delete-cols-ma-tool-cstb-rpt-properties.ts` — `ADD COLUMN IF NOT EXISTS deleted_at timestamptz`, `ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false`, with matching `down()`
- Create (test): `src/modules/data-access/__tests__/ma-tool-report-config.spec.ts`

## Implementation Steps
1. **(Test first)** `ma-tool-report-config.spec.ts` asserting:
   - `HIERARCHY_MAP['ma_tool_cstb_rpt_properties'] === null`
   - `'ma_tool_cstb_rpt_properties' in ROOT_OWNER_CONFIG === false`
   - No `resource_type` in `RESOURCE_TYPE_TO_ROOT_TABLE` resolves to `'ma_tool_cstb_rpt_properties'` (real explicit-only guard)
   - `NAME_COLUMN_MAP['ma_tool_cstb_rpt_properties'] === 'rpt_code'`
   - `ALLOWED_TABLES.has('ma_tool_cstb_rpt_properties') === true`
   - `DATA_ACCESS_TABLE.MA_TOOL_CSTB_RPT_PROPERTIES === 'ma_tool_cstb_rpt_properties'`
   - Pinned module paths `/ma-tool`, `/ma-tool/report` are NOT prefix-descendants of any owner-scoped root path.
   - Run → red.
2. Verify current max IDs (`grep -oE "id: [0-9]+"`): module max 105, permission max 112 → use 106/107/113.
3. Add enum value.
4. Add `HIERARCHY_MAP` (`null`) + `NAME_COLUMN_MAP` (`'rpt_code'`). Do NOT touch `ROOT_OWNER_CONFIG`/`RESOURCE_TYPE_TO_ROOT_TABLE`.
5. Add module seed rows — full shape matching existing rows: `{ id:106, path:'/ma-tool', name:'MA Tool', table_name:null, is_active:true, parent_id:null }`, `{ id:107, path:'/ma-tool/report', name:'Report', table_name:'ma_tool_cstb_rpt_properties', is_active:true, parent_id:106 }`. (`mpath` is auto-computed by seeder — do not hand-set.)
6. Add permission seed row — full shape: `{ id:113, code:'ma_tool_report_view', name:'Xem', method:'GET', action:'read', is_active:true, module_id:107 }`.
7. **(Test first)** Add a `getScopedRecords` unit test: explicit-only table (no `ROOT_OWNER_CONFIG`) returns a non-empty list of candidate records (not `emptyResult`). Then implement the explicit-only branch: when `buildOwnerJoinChain` is null, list records filtered by keyword/date (candidate picker for admins) instead of `emptyResult`. Keep the assignment `create()` endpoint permission-gated (unchanged).
8. Create the soft-delete migration (idempotent `ADD COLUMN IF NOT EXISTS`); provide `down()` dropping the columns.
9. Run config + picker specs → green. `npm run build` clean. Run the new migration in a scratch DB and confirm columns present.

## Success Criteria
- [x] Config spec passes incl. no `resource_type` maps to table + path-prefix safety
- [x] `ROOT_OWNER_CONFIG` / `RESOURCE_TYPE_TO_ROOT_TABLE` unchanged
- [x] `getScopedRecords` returns candidate records for this explicit-only table (picker not empty)
- [x] Soft-delete migration adds `deleted_at` + `is_deleted` idempotently, with `down()`
- [x] Seed rows complete (path/name/is_active/method/action)
- [x] tsc build clean; IDs 106/107/113 collision-free

## Risk Assessment
- **Prod schema gap** (deleted_at/is_deleted missing on Strapi table) → migration with `ADD COLUMN IF NOT EXISTS`; verify with `\d ma_tool_cstb_rpt_properties` on staging before release. Do NOT rely on synchronize-based tests to prove prod readiness.
- **Implied-verb contamination** via module path → pinned `/ma-tool*` namespace + path-prefix test.
- **Accidental owner-scope enablement** → config spec asserts absence from `ROOT_OWNER_CONFIG` AND `RESOURCE_TYPE_TO_ROOT_TABLE`.
- **Picker over-exposure** → explicit-only branch lists candidate records for admins; assignment mutation stays permission-gated. Confirm no unintended data exposure in the picker response (id + display_name only, per existing unscoped query shape).
- **Seeder idempotency** → both seeders insert only missing IDs (`module.seeder.ts:143`, `permission.seeder.ts:380`); re-run safe.
