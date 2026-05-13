# Phase 4 — Relation: Diagnostic Reports

**Priority:** P1 | **Status:** ⚪ | **Effort:** 1h  
**Depends on:** Phase 1 (reports loaded), users table populated

## Overview

Two tasks:
1. Resolve `created_by_admin_id` / `updated_by_admin_id` via admin_users → users email match
2. Migrate labels junction table (`bi_diagnostic_reports_labels_lnk` → `diagnostic_reports_labels`)

## File

`src/data-migrations/relation/bi-hub-diagnostic-report.data-migration.ts`

## Extract SQL — Admin Author (from Strapi DB)

```sql
SELECT
  r.id as report_id,
  created_user.id as created_by_admin_id,
  updated_user.id as updated_by_admin_id
FROM bi_diagnostic_reports r
LEFT JOIN admin_users creator ON r.created_by_id = creator.id
LEFT JOIN users created_user ON creator.email = created_user.email
LEFT JOIN admin_users updater ON r.updated_by_id = updater.id
LEFT JOIN users updated_user ON updater.email = updated_user.email
WHERE r.created_by_id IS NOT NULL OR r.updated_by_id IS NOT NULL
ORDER BY r.id ASC
LIMIT $1 OFFSET $2
```

**Note:** `users` table here is the NestJS destination `users` table. This extract queries BOTH source and destination DBs. Alternative: query Strapi for admin emails, then resolve against NestJS users separately.

**Recommended approach:** Query Strapi only, resolve in transform:
```sql
-- From Strapi DB:
SELECT
  r.id as report_id,
  creator.email as creator_email,
  updater.email as updater_email
FROM bi_diagnostic_reports r
LEFT JOIN admin_users creator ON r.created_by_id = creator.id
LEFT JOIN admin_users updater ON r.updated_by_id = updater.id
WHERE r.created_by_id IS NOT NULL OR r.updated_by_id IS NOT NULL
ORDER BY r.id ASC
LIMIT $1 OFFSET $2
```

Then in transform, batch-resolve emails against NestJS `users` table:
```sql
-- From NestJS DB:
SELECT id, email FROM users WHERE email = ANY($1)
```

## Extract SQL — Labels Junction (from Strapi DB)

```sql
SELECT
  lnk.bi_diagnostic_report_id as diagnostic_report_id,
  lnk.bi_hub_label_id as label_id
FROM bi_diagnostic_reports_labels_lnk lnk
ORDER BY lnk.bi_diagnostic_report_id ASC
LIMIT $1 OFFSET $2
```

## Load SQL — Admin Author (to NestJS DB)

```sql
UPDATE bi_hub_diagnostic_reports d
SET
  created_by_admin_id = x.created_by_admin_id,
  updated_by_admin_id = x.updated_by_admin_id
FROM json_to_recordset($1::json)
AS x(id INT, created_by_admin_id INT, updated_by_admin_id INT)
WHERE d.id = x.id
```

## Load SQL — Labels Junction (to NestJS DB)

```sql
INSERT INTO diagnostic_reports_labels (diagnostic_report_id, label_id)
SELECT x.diagnostic_report_id, x.label_id
FROM json_to_recordset($1::json)
AS x(diagnostic_report_id INT, label_id INT)
INNER JOIN bi_hub_diagnostic_reports r ON r.id = x.diagnostic_report_id
INNER JOIN bi_hub_labels l ON l.id = x.label_id
ON CONFLICT DO NOTHING
```

## Transform Logic

```typescript
transform(data) {
  const userRelationsMap = new Map<number, UserRelation>();
  
  data.forEach(item => {
    if (!userRelationsMap.has(item.report_id)) {
      userRelationsMap.set(item.report_id, {
        id: item.report_id,
        created_by_admin_id: emailToUserIdMap.get(item.creator_email) ?? null,
        updated_by_admin_id: emailToUserIdMap.get(item.updater_email) ?? null,
      });
    }
  });
  
  return { userRelations: Array.from(userRelationsMap.values()) };
}
```

## Implementation Notes

- Labels junction extract is separate paginated loop (not mixed with admin author)
- Admin email→user resolution: pre-fetch all unique emails from batch, bulk-resolve against NestJS users table, build Map
- Use `ON CONFLICT DO NOTHING` for labels junction (idempotent)
- INNER JOINs in labels load ensure FK integrity

## Todo

- [ ] Create relation migration class
- [ ] Admin author: extract emails from Strapi, resolve against NestJS users
- [ ] Labels junction: extract + load with FK validation
- [ ] Type interfaces
- [ ] ESLint clean
