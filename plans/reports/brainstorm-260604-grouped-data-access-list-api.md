# Brainstorm: Grouped Data Access List API

**Date:** 2026-06-04
**Status:** Approved

## Problem Statement

Current `GET /v1/data-access/list` returns flat rows (1 subject per row). Rules with N roles + M users produce N+M rows. Pagination on flat rows makes it hard to see data access by report/record.

**Goal:** Group by `(data_id, module_id)` so each element = 1 report/record with its related rules array. Add record name/code from target tables.

## Requirements

### Expected Output
- Replace existing `/list` endpoint (same route, new response shape)
- Each group = `{ data_id, module_id, module_name, module_path, record_name, table_name, rules: [...] }`
- Pagination by group count (not flat rows)

### Acceptance Criteria
- Paginate at group level: `page=1&limit=10` → 10 groups
- Each group contains ALL rules (roles + users with permissions)
- `record_name` fetched from target table via `NAME_COLUMN_MAP`
- Search works on: data_id, role name, user full_name, **record_name**
- Sort by `created_at` (MAX in group) DESC by default
- All existing filters preserved: module_id, scope_type, subject_type, role_id, user_id

### Scope Boundary
- Only `/list` endpoint changes
- No changes to create/update/delete/details endpoints
- No FE changes in this scope

### Non-negotiable Constraints
- NestJS + TypeORM + raw SQL (matching current pattern)
- Reuse `NAME_COLUMN_MAP` and `ALLOWED_TABLES` from hierarchy-config
- Keep existing filter DTO (`SearchDataAccessDto`)

### Touchpoints
- `src/modules/data-access/data-access.service.ts` — `list()` method (main change)
- `src/modules/data-access/constants/hierarchy-config.ts` — read-only, reuse
- `src/modules/data-access/dto/search-data-access.dto.ts` — minor update if needed
- `src/modules/data-access/data-access.controller.ts` — no change expected

## Chosen Approach: Two-step SQL + Batch Record Lookup

### Step 1 — Paginated Groups Query
```sql
WITH filtered_da AS (
  SELECT DISTINCT da.data_id, da.module_id, MAX(da.created_at) as latest_created_at
  FROM data_access da
  LEFT JOIN data_access_roles dar ON dar.data_access_id = da.id AND dar.deleted_at IS NULL
  LEFT JOIN role r ON r.id = dar.role_id
  LEFT JOIN data_access_users dau ON dau.data_access_id = da.id AND dau.deleted_at IS NULL
  LEFT JOIN users u ON u.id = dau.user_id
  WHERE da.deleted_at IS NULL
  -- dto filters applied here
  GROUP BY da.data_id, da.module_id
)
SELECT data_id, module_id, latest_created_at
FROM filtered_da
ORDER BY latest_created_at DESC
LIMIT $X OFFSET $Y
```
- Separate COUNT query for totalItems
- Search by record_name requires dynamic table join (done via subquery or pre-filter)

### Step 2 — Fetch Flattened Rules for Groups
Reuse existing CTE flattened logic, add:
```sql
WHERE (da.data_id, da.module_id) IN ((42,5), (43,5), ...)
```

### Step 3 — Batch Record Names
Group `data_id`s by `table_name`, query each table once:
```sql
SELECT id, "name" as display_name FROM bi_hub_reports WHERE id IN (...) AND deleted_at IS NULL
```

### Step 4 — Assemble in Code
Map rules into groups, attach record_name, return structured response.

## Response Shape
```json
{
  "data": [
    {
      "data_id": 42,
      "module_id": 5,
      "module_name": "Reports",
      "module_path": "/BI Hub/Reports",
      "record_name": "Q2 Revenue Analysis",
      "table_name": "bi_hub_reports",
      "rules": [
        {
          "rule_id": 1,
          "scope_type": "allow",
          "subject_type": "role",
          "subject_id": 3,
          "subject_name": "Manager",
          "permissions": null,
          "start_date": null,
          "end_date": null,
          "created_at": "2026-05-15T10:20:00Z"
        }
      ]
    }
  ],
  "meta": {
    "totalItems": 50,
    "itemCount": 10,
    "itemsPerPage": 10,
    "currentPage": 1,
    "totalPages": 5
  }
}
```

## Search by Record Name — Design Note

Searching by record_name across dynamic tables is non-trivial since each module references a different table. Options:
1. **Pre-filter with UNION subquery** — build dynamic SQL for each active table in `NAME_COLUMN_MAP`, UNION results to find matching data_ids, then use those in group filter
2. **Post-filter in code** — overfetch groups, filter by record_name in app layer (not ideal for pagination accuracy)
3. **Materialized name column on data_access** — denormalize record_name into `data_access` table (cleaner but requires migration + sync logic)

**Recommendation:** Option 1 (pre-filter UNION) for now. If performance becomes an issue, consider Option 3 as future optimization.

## Risks
- **Search by record_name performance**: Dynamic UNION across multiple tables could be slow if many tables active. Mitigate: only query tables matching current `module_id` filter, or limit to active modules
- **Record deletion**: If target record is deleted (soft), `record_name` may be null. Handle gracefully with fallback `"ID: {data_id}"`

## Alternatives Considered

| Approach | Verdict |
|----------|---------|
| Single mega-SQL with json_agg | Too complex, still needs separate record name query |
| ORM-based + code grouping | Doesn't scale, fetches all then paginates in memory |

## Next Steps
→ `/ck:plan` to create implementation phases
