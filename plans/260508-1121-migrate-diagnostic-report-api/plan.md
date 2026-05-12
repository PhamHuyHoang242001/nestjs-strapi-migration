---
title: "Migrate Diagnostic Report API from Strapi to NestJS"
description: "Create 11 diagnostic report endpoints + 2 BICC department helper endpoints, replacing old group-based permissions with RequirePermission + RequireDataAccess system"
status: pending
priority: P1
effort: 8h
branch: TBD
tags: [migration, diagnostic-report, permission, nestjs, api]
blockedBy: []
blocks: []
planDir: plans/260508-1121-migrate-diagnostic-report-api
---

# Plan — Migrate Diagnostic Report API

## Context

Migrating diagnostic report APIs from Strapi v5 to NestJS. FE unchanged → route paths, payload, response must match exactly. Auth unified: no admin/user split, all through user + role + data_access.

**Source:** `strapiv5-old/src/api/bi-hub-report/services/bi-diagnostic-user.ts` + `bi-diagnostic-admin.ts`
**Target:** `nestjs-new/base-be-ts-sql/src/modules/bi-hub-diagnostic-report/`
**Reference pattern:** `src/modules/bicc-department/` (controller + service)

## Route Summary

### User Routes (5) — prefix `/bi-hub/diagnostic-report`
| Method | Path | Permission |
|--------|------|------------|
| GET | `/bi-hub/diagnostic-report` | `bh_diag_report_view` |
| GET | `/bi-hub/diagnostic-report/:id` | `bh_diag_report_view` |
| GET | `/bi-hub/diagnostic-report/updated-user` | `bh_diag_report_view` |
| GET | `/bi-hub/diagnostic-report/history` | `bh_diag_report_view` |
| POST | `/bi-hub/diagnostic-report/view` | `bh_diag_report_view` |

### Admin Routes (6) — prefix `/admin/diagnostic`
| Method | Path | Permission |
|--------|------|------------|
| POST | `/admin/diagnostic/report` | `bh_diag_report_create` |
| PATCH | `/admin/diagnostic/report/:id` | `bh_diag_report_edit` |
| DELETE | `/admin/diagnostic/report/:id` | `bh_diag_report_delete` |
| DELETE | `/admin/diagnostic/report` | `bh_diag_report_delete` |
| GET | `/admin/diagnostic/report/download` | `bh_diag_report_download` |
| PATCH | `/admin/diagnostic/sync-group-manager` | `bh_diag_report_edit` |

### BICC Department Helpers (2) — add to existing controller
| Method | Path | Permission |
|--------|------|------------|
| GET | `/bi-hub/bicc-department/admin` | `bh_bicc_dept_view` |
| GET | `/bi-hub/bicc-department/scope` | `bh_bicc_dept_view` |

## Permission Migration

**Old (Strapi):** `getDiagnosticReportIDsPermission(user.groups)` + `getDiagnosticReportIDsAdminPermission(user.groupAdmins, user.adminId)` → raw SQL to `user_data_permissions` + `admin_data_permissions`

**New (NestJS):** `@RequirePermission('code')` + `@RequireDataAccess(tableName, permissionCode)` → `DataAccessInterceptor` → `PermissionCacheService.getAccessibleRecords()` → `req.info.accessibleDataIds`

## Fields Removed
- `supporter` (M:N relation via admin link) — removed from response
- `pic` (M:N relation via admin link) — removed from response
- `bi_diagnostic_category` — entity already deleted
- `group_permissions`, `group_admin_permissions` — old permission system
- `publishedAt` filter — not applicable in NestJS

## Phases

| Phase | File | Status | Effort |
|-------|------|--------|--------|
| 1 | [phase-01-module-scaffolding.md](phase-01-module-scaffolding.md) | pending | 1.5h |
| 2 | [phase-02-user-read-endpoints.md](phase-02-user-read-endpoints.md) | pending | 2.5h |
| 3 | [phase-03-admin-write-endpoints.md](phase-03-admin-write-endpoints.md) | pending | 2.5h |
| 4 | [phase-04-bicc-department-helpers.md](phase-04-bicc-department-helpers.md) | pending | 0.5h |
| 5 | [phase-05-testing.md](phase-05-testing.md) | pending | 1h |
