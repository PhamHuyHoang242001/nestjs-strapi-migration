---
phase: 3
title: Implement Grouped List Query
status: completed
priority: P2
effort: 2h
dependencies:
  - 2
---

# Phase 3: Implement Grouped List Query

## Overview

Replace `list()` in `data-access.service.ts` with the two-step SQL + batch record lookup approach. This is the main implementation phase — all Phase 2 tests should turn green.

## Requirements

- Functional: Grouped response, group-level pagination, batch record names, all existing filters preserved
- Non-functional: No N+1 queries, batch record lookups by table_name

## Architecture

### Query Flow (3 steps)

**Step 1 — Count + Paginated Groups:**
```sql
-- Count distinct groups
SELECT COUNT(*) FROM (
  SELECT DISTINCT da.data_id, da.module_id
  FROM data_access da
  LEFT JOIN data_access_roles dar ON dar.data_access_id = da.id AND dar.deleted_at IS NULL
  LEFT JOIN data_access_users dau ON dau.data_access_id = da.id AND dau.deleted_at IS NULL
  LEFT JOIN role r ON r.id = dar.role_id
  LEFT JOIN users u ON u.id = dau.user_id
  WHERE da.deleted_at IS NULL
  {filters}
) groups

-- Paginated groups
SELECT da.data_id, da.module_id, m.table_name, m.path as module_path, m.name as module_name,
       MAX(da.created_at) as latest_created_at
FROM data_access da
JOIN modules m ON m.id = da.module_id
LEFT JOIN data_access_roles dar ON dar.data_access_id = da.id AND dar.deleted_at IS NULL
LEFT JOIN data_access_users dau ON dau.data_access_id = da.id AND dau.deleted_at IS NULL
LEFT JOIN role r ON r.id = dar.role_id
LEFT JOIN users u ON u.id = dau.user_id
WHERE da.deleted_at IS NULL
{filters}
GROUP BY da.data_id, da.module_id, m.table_name, m.path, m.name
ORDER BY latest_created_at DESC
LIMIT $X OFFSET $Y
```

**Step 2 — Rules for Groups:**
Reuse existing flattened CTE, filter by `WHERE (da.data_id, da.module_id) IN (...)`:
```sql
WITH flattened AS (
  -- role branch (same as current)
  UNION ALL
  -- user branch (same as current)
)
SELECT * FROM flattened
WHERE (data_id, module_id) IN ((42,5), (43,5), ...)
ORDER BY rule_id DESC
```

**Step 3 — Batch Record Names:**
```typescript
// Group data_ids by table_name
const byTable = new Map<string, number[]>();
for (const group of groups) {
  const ids = byTable.get(group.table_name) || [];
  ids.push(group.data_id);
  byTable.set(group.table_name, ids);
}
// Query each table once
for (const [tableName, ids] of byTable) {
  const nameCol = getNameColumn(tableName);
  const rows = await this.connection.query(
    `SELECT id, "${nameCol}" as display_name FROM "${tableName}" WHERE id = ANY($1) AND deleted_at IS NULL`,
    [ids]
  );
  // Map into lookup
}
```

**Step 4 — Assemble:**
```typescript
return {
  data: groups.map(g => ({
    data_id: g.data_id,
    module_id: g.module_id,
    module_name: g.module_name,
    module_path: g.module_path,
    record_name: recordNames.get(`${g.data_id}-${g.module_id}`) || `ID: ${g.data_id}`,
    table_name: g.table_name,
    rules: rulesByGroup.get(`${g.data_id}-${g.module_id}`) || [],
  })),
  meta: { totalItems, itemCount, itemsPerPage, currentPage, totalPages }
};
```

## Related Code Files

- Modify: `src/modules/data-access/data-access.service.ts` — rewrite `list()` method (~lines 66-165)
- Modify: `src/modules/data-access/data-access.controller.ts` — update Swagger summary (line 24)
- Read: `src/modules/data-access/constants/hierarchy-config.ts` — `getNameColumn`, `ALLOWED_TABLES`
- Read: `src/modules/data-access/__tests__/data-access-list.service.spec.ts` — verify tests pass

## Implementation Steps

1. **Extract batch record name helper** — Add `private async batchFetchRecordNames(groups)` method to service
2. **Rewrite `list()` method:**
   - Build filter WHERE clause (same params as current, but join through junction tables for subject filters)
   - Execute count query (distinct groups)
   - Execute paginated groups query
   - If no groups → return early with empty data + meta
   - Execute flattened rules query for those groups
   - Execute batch record names
   - Assemble grouped response
3. **Update controller Swagger summary** — Change from "flattened 1-1" to "grouped by record"
4. **Run Phase 2 tests** — All grouped tests should pass (green)
5. **Compile check** — `npx tsc --noEmit`

## Success Criteria

- [ ] `list()` returns grouped response shape
- [ ] Pagination by group count works correctly
- [ ] All existing filters (module_id, scope_type, subject_type, role_id, user_id) work
- [ ] Batch record names fetched without N+1
- [ ] `record_name` falls back to `"ID: {data_id}"` for missing records
- [ ] Sort by `MAX(created_at) DESC` default works
- [ ] All Phase 2 tests pass green
- [ ] `npx tsc --noEmit` passes
- [ ] Service file stays under 200 lines (extract helper if needed)

## Risk Assessment

- **SQL injection via table_name**: Mitigated — `ALLOWED_TABLES` whitelist + `getNameColumn` regex validation already in place
- **Performance with many groups per page**: Batch queries keep it O(tables), not O(groups)
- **Row tuple IN clause**: PostgreSQL handles `IN ((a,b), ...)` well; for very large pages could switch to temp table, but limit=20 default is safe
