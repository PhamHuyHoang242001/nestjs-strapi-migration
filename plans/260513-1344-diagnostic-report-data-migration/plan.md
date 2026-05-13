---
title: "Data Migration — Diagnostic Report Tables (Strapi → NestJS)"
description: "ETL scripts to migrate bi_diagnostic_reports, bi_diagnostic_files, bi_diagnostic_history_reports from old Strapi DB to new NestJS DB. Category layer removed, reports link directly to bicc_department."
status: pending
priority: P1
effort: 4h
branch: main
tags: [data-migration, diagnostic-report, etl, strapi-to-nestjs]
blockedBy: []
blocks: []
planDir: plans/260513-1344-diagnostic-report-data-migration
---

# Plan — Diagnostic Report Data Migration

## Context

Migrate diagnostic report data from Strapi v5 PostgreSQL to NestJS PostgreSQL using existing ETL framework at `src/data-migrations/`. Follow the established pattern from `bi-hub-bicc-department.data-migration.ts`.

**Key decisions:**
- Category layer REMOVED → resolve `bicc_department_id` via category JOIN
- Skip: diagnostic_scopes, pic/supporter junctions, division/center/department FKs, file_media field
- Admin author: resolve `admin_users` → `users` by email match

## Phases

| # | Phase | File | Status |
|---|-------|------|--------|
| 1 | [Metadata — Diagnostic Reports](phase-01-metadata-diagnostic-report.md) | `metadata/bi-hub-diagnostic-report.data-migration.ts` | ⚪ |
| 2 | [Metadata — Diagnostic Files](phase-02-metadata-diagnostic-file.md) | `metadata/bi-hub-diagnostic-file.data-migration.ts` | ⚪ |
| 3 | [Metadata — Diagnostic History](phase-03-metadata-diagnostic-history-report.md) | `metadata/bi-hub-diagnostic-history-report.data-migration.ts` | ⚪ |
| 4 | [Relation — Diagnostic Reports](phase-04-relation-diagnostic-report.md) | `relation/bi-hub-diagnostic-report.data-migration.ts` | ⚪ |
| 5 | [Relation — Diagnostic History](phase-05-relation-diagnostic-history-report.md) | `relation/bi-hub-diagnostic-history-report.data-migration.ts` | ⚪ |
| 6 | [Index Updates + Build Verify](phase-06-index-updates-and-build.md) | `metadata-index.ts`, `relation-index.ts` | ⚪ |

## Execution Order

```
bicc_department (already done)
  └─→ Phase 1: diagnostic_reports metadata
        ├─→ Phase 2: diagnostic_files metadata
        ├─→ Phase 3: diagnostic_history_reports metadata
        └─→ Phase 4: diagnostic_reports relation (admin author + labels)
              └─→ Phase 5: diagnostic_history_reports relation (admin author)
Phase 6: index updates + build verify (after all)
```

## Dependencies

- `bicc_department` metadata + relation migration must run first (already implemented)
- `bi_hub_labels` table must have data (either seeded or migrated separately)
- `users` table must have admin users (for email-based author resolution)
