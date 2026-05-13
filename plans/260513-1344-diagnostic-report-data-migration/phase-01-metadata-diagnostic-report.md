# Phase 1 — Metadata: Diagnostic Reports

**Priority:** P1 | **Status:** ⚪ | **Effort:** 1h

## Overview

Extract diagnostic reports from Strapi `bi_diagnostic_reports`, resolve `bicc_department_id` through category layer, transform field names, load into NestJS `bi_hub_diagnostic_reports`.

## File

`src/data-migrations/metadata/bi-hub-diagnostic-report.data-migration.ts`

## Extract SQL (from Strapi DB)

```sql
SELECT
  r.id,
  r.name,
  r.is_sensitive,
  r.diagnostic_report_status,
  r.icon,
  r.bu_name,
  r.is_deleted,
  r.version,
  r.is_change_link,
  r.total_view,
  r.txt_diagnostic_scope,
  r.summary,
  r.insight,
  r.code,
  cat.bicc_department_id,
  r.created_at,
  r.updated_at
FROM bi_diagnostic_reports r
LEFT JOIN bi_diagnostic_categories cat ON r.bi_diagnostic_category_id = cat.id
ORDER BY r.id ASC
LIMIT $1 OFFSET $2
```

## Transform Mapping

| Strapi Field | NestJS Field | Type | Notes |
|-------------|-------------|------|-------|
| id | id | INT | preserve |
| name | name | TEXT | direct |
| is_sensitive | is_sensitive | BOOLEAN | direct |
| diagnostic_report_status | status | TEXT | **rename** |
| icon | icon | TEXT | direct |
| bu_name | bu_name | TEXT | direct |
| is_deleted | is_deleted | BOOLEAN | direct |
| version | version | INT | direct |
| is_change_link | is_change_link | BOOLEAN | direct |
| total_view | total_view | INT | direct |
| txt_diagnostic_scope | txt_diagnostic_scope | TEXT | direct |
| summary | summary | TEXT | direct |
| insight | insight | JSON | direct (already json) |
| code | code | TEXT | direct |
| cat.bicc_department_id | bicc_department_id | INT | **via category JOIN** |
| created_at | created_at | TIMESTAMPTZ | direct |
| updated_at | updated_at | TIMESTAMPTZ | direct |

## Load SQL (to NestJS DB)

```sql
INSERT INTO bi_hub_diagnostic_reports (
  id, name, is_sensitive, status, icon, bu_name, is_deleted,
  version, is_change_link, total_view, txt_diagnostic_scope,
  summary, insight, code, bicc_department_id, created_at, updated_at
)
SELECT
  id, name, is_sensitive, status, icon, bu_name, is_deleted,
  version, is_change_link, total_view, txt_diagnostic_scope,
  summary, insight, code, bicc_department_id, created_at, updated_at
FROM json_to_recordset($1::json)
AS x(
  id INT, name TEXT, is_sensitive BOOLEAN, status TEXT, icon TEXT,
  bu_name TEXT, is_deleted BOOLEAN, version INT, is_change_link BOOLEAN,
  total_view INT, txt_diagnostic_scope TEXT, summary TEXT,
  insight JSON, code TEXT, bicc_department_id INT,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
ON CONFLICT (id)
DO UPDATE SET
  name = EXCLUDED.name,
  is_sensitive = EXCLUDED.is_sensitive,
  status = EXCLUDED.status,
  icon = EXCLUDED.icon,
  bu_name = EXCLUDED.bu_name,
  is_deleted = EXCLUDED.is_deleted,
  version = EXCLUDED.version,
  is_change_link = EXCLUDED.is_change_link,
  total_view = EXCLUDED.total_view,
  txt_diagnostic_scope = EXCLUDED.txt_diagnostic_scope,
  summary = EXCLUDED.summary,
  insight = EXCLUDED.insight,
  code = EXCLUDED.code,
  bicc_department_id = EXCLUDED.bicc_department_id,
  updated_at = EXCLUDED.updated_at
```

## Sequence Reset

```sql
SELECT setval('bi_hub_diagnostic_reports_id_seq', COALESCE((SELECT MAX(id) FROM bi_hub_diagnostic_reports), 1))
```

## Implementation Notes

- Follow `bi-hub-bicc-department.data-migration.ts` pattern exactly
- Use `DataSourceOptions` from `../datasource.ts` (no `as any` cast)
- Create typed interface `ExtractedDiagnosticReport` for extract result
- Create DTO class `BiHubDiagnosticReportDto` with class-validator decorators
- Batch size: 10000
- `insight` field is JSON in both Strapi and NestJS — pass through directly

## Todo

- [ ] Create migration class with constructor, run, extract, transform, load, resetSequence
- [ ] Type interfaces for extract result
- [ ] DTO with class-validator
- [ ] ESLint clean
