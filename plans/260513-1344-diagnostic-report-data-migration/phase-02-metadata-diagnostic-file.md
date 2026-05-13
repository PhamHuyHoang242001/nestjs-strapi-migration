# Phase 2 — Metadata: Diagnostic Files

**Priority:** P1 | **Status:** ⚪ | **Effort:** 30m  
**Depends on:** Phase 1 (reports must exist for FK)

## Overview

Extract diagnostic files from Strapi `bi_diagnostic_files`, rename FK, skip `file_media`, load into NestJS `bi_hub_diagnostic_files`.

## File

`src/data-migrations/metadata/bi-hub-diagnostic-file.data-migration.ts`

## Extract SQL (from Strapi DB)

```sql
SELECT
  f.id,
  f.file_url,
  f.type,
  f.name,
  f.diagnostic_report_id,
  f.lastest_version,
  f.file_status,
  f.created_at,
  f.updated_at
FROM bi_diagnostic_files f
ORDER BY f.id ASC
LIMIT $1 OFFSET $2
```

## Transform Mapping

| Strapi Field | NestJS Field | Notes |
|-------------|-------------|-------|
| id | id | preserve |
| file_url | file_url | direct |
| type | type | direct |
| name | name | direct |
| diagnostic_report_id | bi_hub_diagnostic_report_id | **rename** |
| lastest_version | lastest_version | direct |
| file_status | status | **rename** |
| created_at | created_at | direct |
| updated_at | updated_at | direct |

**Skipped:** `file_media` — not migrated per decision.

## Load SQL (to NestJS DB)

```sql
INSERT INTO bi_hub_diagnostic_files (
  id, file_url, type, name, bi_hub_diagnostic_report_id,
  lastest_version, status, created_at, updated_at
)
SELECT
  id, file_url, type, name, bi_hub_diagnostic_report_id,
  lastest_version, status, created_at, updated_at
FROM json_to_recordset($1::json)
AS x(
  id INT, file_url TEXT, type TEXT, name TEXT,
  bi_hub_diagnostic_report_id INT, lastest_version BOOLEAN,
  status TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
ON CONFLICT (id)
DO UPDATE SET
  file_url = EXCLUDED.file_url,
  type = EXCLUDED.type,
  name = EXCLUDED.name,
  bi_hub_diagnostic_report_id = EXCLUDED.bi_hub_diagnostic_report_id,
  lastest_version = EXCLUDED.lastest_version,
  status = EXCLUDED.status,
  updated_at = EXCLUDED.updated_at
```

## Sequence Reset

```sql
SELECT setval('bi_hub_diagnostic_files_id_seq', COALESCE((SELECT MAX(id) FROM bi_hub_diagnostic_files), 1))
```

## Notes

- No relation phase needed — `BiHubDiagnosticFile` extends `BaseSoftDeleteEntity` (no author columns)
- FK `bi_hub_diagnostic_report_id` is direct rename, resolved in metadata phase
- Simple migration, no JOINs needed in extract

## Todo

- [ ] Create migration class
- [ ] Type interfaces + DTO
- [ ] ESLint clean
