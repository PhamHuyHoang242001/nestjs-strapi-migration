# Phase 3 — Metadata: Diagnostic History Reports

**Priority:** P1 | **Status:** ⚪ | **Effort:** 30m  
**Depends on:** Phase 1 (reports must exist for FK)

## Overview

Extract history reports from Strapi `bi_diagnostic_history_reports`, rename FK, load into NestJS `bi_hub_diagnostic_history_reports`.

## File

`src/data-migrations/metadata/bi-hub-diagnostic-history-report.data-migration.ts`

## Extract SQL (from Strapi DB)

```sql
SELECT
  h.id,
  h.name,
  h.change_log,
  h.version,
  h.diagnostic_files_id,
  h.diagnostic_files_name,
  h.diagnostic_files_url,
  h.diagnostic_files_type,
  h.diagnostic_report_id,
  h.is_change_link,
  h.code,
  h.created_at,
  h.updated_at
FROM bi_diagnostic_history_reports h
ORDER BY h.id ASC
LIMIT $1 OFFSET $2
```

## Transform Mapping

| Strapi Field | NestJS Field | Notes |
|-------------|-------------|-------|
| id | id | preserve |
| name | name | direct |
| change_log | change_log | direct (JSON) |
| version | version | direct |
| diagnostic_files_id | diagnostic_files_id | direct |
| diagnostic_files_name | diagnostic_files_name | direct |
| diagnostic_files_url | diagnostic_files_url | direct |
| diagnostic_files_type | diagnostic_files_type | direct |
| diagnostic_report_id | bi_hub_diagnostic_report_id | **rename** |
| is_change_link | is_change_link | direct |
| code | code | direct |
| created_at | created_at | direct |
| updated_at | updated_at | direct |

## Load SQL (to NestJS DB)

```sql
INSERT INTO bi_hub_diagnostic_history_reports (
  id, name, change_log, version, diagnostic_files_id,
  diagnostic_files_name, diagnostic_files_url, diagnostic_files_type,
  bi_hub_diagnostic_report_id, is_change_link, code, created_at, updated_at
)
SELECT
  id, name, change_log, version, diagnostic_files_id,
  diagnostic_files_name, diagnostic_files_url, diagnostic_files_type,
  bi_hub_diagnostic_report_id, is_change_link, code, created_at, updated_at
FROM json_to_recordset($1::json)
AS x(
  id INT, name TEXT, change_log JSON, version INT,
  diagnostic_files_id INT, diagnostic_files_name TEXT,
  diagnostic_files_url TEXT, diagnostic_files_type TEXT,
  bi_hub_diagnostic_report_id INT, is_change_link BOOLEAN,
  code TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
ON CONFLICT (id)
DO UPDATE SET
  name = EXCLUDED.name,
  change_log = EXCLUDED.change_log,
  version = EXCLUDED.version,
  diagnostic_files_id = EXCLUDED.diagnostic_files_id,
  diagnostic_files_name = EXCLUDED.diagnostic_files_name,
  diagnostic_files_url = EXCLUDED.diagnostic_files_url,
  diagnostic_files_type = EXCLUDED.diagnostic_files_type,
  bi_hub_diagnostic_report_id = EXCLUDED.bi_hub_diagnostic_report_id,
  is_change_link = EXCLUDED.is_change_link,
  code = EXCLUDED.code,
  updated_at = EXCLUDED.updated_at
```

## Sequence Reset

```sql
SELECT setval('bi_hub_diagnostic_history_reports_id_seq', COALESCE((SELECT MAX(id) FROM bi_hub_diagnostic_history_reports), 1))
```

## Notes

- Admin author columns (`created_by_admin_id`, `updated_by_admin_id`) handled in Phase 5 relation
- `change_log` is JSON — pass through directly

## Todo

- [ ] Create migration class
- [ ] Type interfaces + DTO
- [ ] ESLint clean
