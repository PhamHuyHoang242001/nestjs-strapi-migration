---
phase: 4
title: Search by Record Name
status: completed
priority: P2
effort: 1.5h
dependencies:
  - 3
---

# Phase 4: Search by Record Name

## Overview

Extend grouped list to support searching by `record_name` in addition to existing search fields (data_id, role name, user full_name). Uses pre-filter UNION approach to find matching data_ids from dynamic tables.

## Requirements

- Functional: `?search=Revenue` matches groups where record_name contains "Revenue" (case-insensitive, unaccented)
- Non-functional: Only query tables relevant to current filter (if module_id specified, only that module's table)

## Architecture

When `dto.search` is provided, build a dynamic pre-filter:

```sql
-- Pre-filter: find data_ids matching record_name across relevant tables
WITH name_matches AS (
  SELECT id as data_id, 5 as module_id FROM bi_hub_reports
  WHERE "name" ILIKE '%Revenue%' AND deleted_at IS NULL
  UNION ALL
  SELECT id as data_id, 3 as module_id FROM ma_tool_documents
  WHERE "document_name" ILIKE '%Revenue%' AND deleted_at IS NULL
  -- ... one per active table (or just the filtered module's table)
)
```

Then in the groups query, add:
```sql
AND (
  -- existing search conditions
  CAST(da.data_id AS TEXT) ILIKE $search
  OR s.subject_name ILIKE $search
  -- new: record_name match
  OR (da.data_id, da.module_id) IN (SELECT data_id, module_id FROM name_matches)
)
```

**Optimization:** If `dto.module_id` is specified, only query that module's target table instead of all tables.

## Related Code Files

- Modify: `src/modules/data-access/data-access.service.ts` — extend `list()` search logic
- Modify: `src/modules/data-access/__tests__/data-access-list.service.spec.ts` — add search tests
- Read: `src/modules/data-access/constants/hierarchy-config.ts` — `ALLOWED_TABLES`, `NAME_COLUMN_MAP`

## Implementation Steps

### TDD: Write Tests First

1. Add test cases to test file:

```typescript
describe('search by record_name', () => {
  it('search keyword matches record_name from target table')
  it('search matches across data_id, subject_name, AND record_name (OR logic)')
  it('when module_id filter present, only queries that module table for name search')
  it('when no module_id filter, queries all active tables')
  it('case-insensitive and unaccented matching')
})
```

2. Run tests — they should fail (red)

### Implement

3. **Build name search CTE** — In `list()`, when `dto.search` exists:
   - Determine tables to search: if `dto.module_id` → resolve that module's `table_name` only; else → all `ALLOWED_TABLES`
   - For each table, generate UNION branch: `SELECT id as data_id FROM "{table}" WHERE "{nameCol}" ILIKE $search AND deleted_at IS NULL`
   - Need to resolve module_id for each table — query `modules` table or add reverse lookup to config

4. **Inject CTE into groups query** — Add `name_matches` CTE and extend WHERE clause with OR condition

5. **Run tests** — All should pass (green)

6. **Compile check** — `npx tsc --noEmit`

## Success Criteria

- [ ] Search tests written and initially fail
- [ ] `?search=Revenue` finds groups where record_name matches
- [ ] Search still works for data_id and subject_name (OR logic, not replaced)
- [ ] `?search=Revenue&module_id=5` only queries `bi_hub_reports` table
- [ ] `?search=Revenue` without module_id queries all relevant tables
- [ ] All Phase 2 + Phase 4 tests pass green
- [ ] `npx tsc --noEmit` passes

## Risk Assessment

- **Dynamic SQL building**: Multiple UNION branches built from config. Mitigated: all table names come from `ALLOWED_TABLES` (hardcoded whitelist), column names from `NAME_COLUMN_MAP` with regex validation
- **Performance with many tables**: 11 tables max in current config, each UNION branch is index-scanned. Acceptable for now
- **Module-to-table reverse mapping**: Need to map table_name back to module_id for the UNION branches. Can query `modules` table or build static reverse map from config
