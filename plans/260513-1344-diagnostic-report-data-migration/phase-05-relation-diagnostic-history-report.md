# Phase 5 — Relation: Diagnostic History Reports

**Priority:** P1 | **Status:** ⚪ | **Effort:** 30m  
**Depends on:** Phase 3 (history loaded), Phase 4 pattern (reuse email resolution)

## Overview

Resolve `created_by_admin_id` / `updated_by_admin_id` for history reports via admin_users → users email match. Same pattern as Phase 4.

## File

`src/data-migrations/relation/bi-hub-diagnostic-history-report.data-migration.ts`

## Extract SQL (from Strapi DB)

```sql
SELECT
  h.id as history_id,
  creator.email as creator_email,
  updater.email as updater_email
FROM bi_diagnostic_history_reports h
LEFT JOIN admin_users creator ON h.created_by_id = creator.id
LEFT JOIN admin_users updater ON h.updated_by_id = updater.id
WHERE h.created_by_id IS NOT NULL OR h.updated_by_id IS NOT NULL
ORDER BY h.id ASC
LIMIT $1 OFFSET $2
```

## Transform

Same email→userId resolution pattern as Phase 4:
1. Collect unique emails from batch
2. Bulk query NestJS `users` table: `SELECT id, email FROM users WHERE email = ANY($1)`
3. Build `Map<string, number>` for lookup
4. Map each history record to `{ id, created_by_admin_id, updated_by_admin_id }`

## Load SQL (to NestJS DB)

```sql
UPDATE bi_hub_diagnostic_history_reports h
SET
  created_by_admin_id = x.created_by_admin_id,
  updated_by_admin_id = x.updated_by_admin_id
FROM json_to_recordset($1::json)
AS x(id INT, created_by_admin_id INT, updated_by_admin_id INT)
WHERE h.id = x.id
```

## Notes

- Simpler than Phase 4 — no junction tables, only admin author resolution
- Reuse same email resolution approach

## Todo

- [ ] Create relation migration class
- [ ] Admin email→user resolution
- [ ] Type interfaces
- [ ] ESLint clean
