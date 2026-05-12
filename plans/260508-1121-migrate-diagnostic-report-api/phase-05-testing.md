---
phase: 5
title: Integration Testing
status: pending
priority: high
effort: 1h
---

# Phase 5 — Integration Testing

## Overview
Test all 13 endpoints via curl/HTTP. Verify permission enforcement, data access filtering, response format, and edge cases. Each endpoint must be called and validated.

## Prerequisites
- NestJS dev server running
- Test user with role + `bh_diag_report_*` permissions seeded
- Test user with `bh_bicc_dept_view` permission
- Test data: BICC departments, diagnostic reports, files, history, scopes, labels seeded
- Data access rules assigned to test user for specific reports

## Test Matrix

### User Read Endpoints

| # | Endpoint | Test Cases |
|---|----------|------------|
| 1 | GET `/bi-hub/diagnostic-report` | - List with pagination (page=1, limit=5) |
| | | - Filter by `reportCategoryId` (bicc_department_id) |
| | | - Keyword search (name, summary, bu_name, txt_diagnostic_scope) |
| | | - Filter by `labelIds` (comma-separated) |
| | | - Filter by `reportStatus` (active/inactive) |
| | | - Sort by `createdAt`, `total_view`, `updatedAt` (ASC/DESC) |
| | | - Empty result when user has no data_access |
| | | - Invalid sortField → 400 |
| 2 | GET `/bi-hub/diagnostic-report/:id` | - Valid ID → full report with relations |
| | | - ID not in user's data_access → 403 |
| | | - Non-existent ID → 404 |
| | | - Deleted report (is_deleted=true) → 404 |
| | | - Response includes: labels, file, division, center, department |
| | | - Response excludes: pic, supporter, key_insights, category |
| 3 | GET `/bi-hub/diagnostic-report/updated-user` | - Valid reportId → paginated user list |
| | | - Missing reportId → 400 |
| | | - reportId not accessible → 403 |
| | | - Keyword filter on email |
| | | - Pagination works correctly |
| 4 | GET `/bi-hub/diagnostic-report/history` | - Valid reportId → paginated history |
| | | - Missing reportId → 400 |
| | | - reportId not accessible → 403 |
| | | - Filter by `updatedByIds` (comma-separated) |
| | | - Filter by `isLinkReportChange` |
| | | - Keyword search on name |
| | | - Sort by createdAt, name, updatedAt |
| 5 | POST `/bi-hub/diagnostic-report/view` | - Valid reportId → total_view incremented |
| | | - reportId not accessible → 403 |
| | | - Non-existent reportId → 404 |
| | | - Concurrent calls → correct increment |

### Admin Write Endpoints

| # | Endpoint | Test Cases |
|---|----------|------------|
| 6 | POST `/admin/diagnostic/report` | - Valid payload → creates report + file + history |
| | | - Response: `{ id }` |
| | | - Code generated: `BICC_{deptCode}_{reportId}` |
| | | - Labels M:N connected |
| | | - History version = 0 created |
| | | - Missing required fields → 400 |
| | | - No `bh_diag_report_create` permission → 403 |
| 7 | PATCH `/admin/diagnostic/report/:id` | - Partial update (only name) → only name changes |
| | | - File update → old file `lastest_version=false`, new file created |
| | | - Labels update → M:N synced |
| | | - History record created with change_log |
| | | - Version incremented |
| | | - ID not accessible → 403 |
| | | - Deleted report → 404 |
| 8 | DELETE `/admin/diagnostic/report/:id` | - Valid ID → `is_deleted = true` |
| | | - Already deleted → 404 |
| | | - ID not accessible → 403 |
| | | - No `bh_diag_report_delete` permission → 403 |
| 9 | DELETE `/admin/diagnostic/report` | - `ids=1,2,3` → deletes accessible ones |
| | | - Returns `{ success: N, error: M }` |
| | | - Mixed accessible/inaccessible IDs → partial delete |
| | | - Empty/invalid ids → 400 |
| 10 | GET `/admin/diagnostic/report/download` | - `download_type=ALL` → filtered list |
| | | - `download_type=MULTIPLE&ids=1,2` → specific reports |
| | | - Data access filtering applied for ALL mode |
| | | - No `bh_diag_report_download` permission → 403 |
| 11 | PATCH `/admin/diagnostic/sync-group-manager` | - Executes without error |
| | | - No `bh_diag_report_edit` permission → 403 |

### BICC Department Helpers

| # | Endpoint | Test Cases |
|---|----------|------------|
| 12 | GET `/bi-hub/bicc-department/admin` | - Valid biccDepartmentId → user list |
| | | - Missing biccDepartmentId → 400 |
| | | - Keyword filter on email |
| | | - Pagination |
| 13 | GET `/bi-hub/bicc-department/scope` | - Valid biccDepartmentId → scope list |
| | | - Missing biccDepartmentId → 400 |
| | | - Keyword filter on name/description |
| | | - Only active scopes returned |

## Permission Test Scenarios

| Scenario | Expected |
|----------|----------|
| No Bearer token | 401 Unauthorized |
| Valid token, no role permissions | 403 Forbidden (PermissionGuard) |
| Has `bh_diag_report_view` but no data_access | 200 with empty list |
| Has `bh_diag_report_view` + data_access for report 1,2 | 200 with only report 1,2 |
| Has view but not create permission | GET 200, POST 403 |
| Has view but not delete permission | GET 200, DELETE 403 |

## Response Format Verification

### Pagination meta (must match Strapi exactly):
```json
{
  "data": [...],
  "meta": {
    "totalItems": 100,
    "itemCount": 10,
    "itemsPerPage": 10,
    "totalPages": 10,
    "currentPage": 1
  }
}
```

### Report response shape (must match FE expectations):
```json
{
  "id": 1,
  "name": "Report name",
  "summary": "...",
  "diagnostic_scopes": "scope text",
  "bu_name": "Division_Center_Department",
  "file": { "url": "...", "type": "POWER_BI" },
  "labels": [{ "id": 1, "name": "Label1" }],
  "diagnostic_report_status": "active",
  "total_view": 42,
  "code": "BICC_ABC_1",
  "icon": "icon-name",
  "is_sensitive": false,
  "version": 3,
  "created_at": "...",
  "updated_at": "..."
}
```

Fields that must NOT appear: `pic`, `supporter`, `bi_diagnostic_category`, `group_permissions`, `group_admin_permissions`, `key_insights`, `txt_diagnostic_scope`, `bi_hub_diagnostic_files`.

## Todo
- [ ] Seed test data (department, reports, files, history, scopes, labels)
- [ ] Seed test user with appropriate role + permissions + data_access
- [ ] Test all 5 user read endpoints
- [ ] Test all 6 admin write endpoints
- [ ] Test 2 BICC department helpers
- [ ] Verify permission enforcement (403 scenarios)
- [ ] Verify data access filtering (empty results vs accessible)
- [ ] Verify response format matches FE expectations
- [ ] Run `npx tsc --noEmit` final check

## Success Criteria
- All 13 endpoints return correct HTTP status codes
- Permission system works: unauthorized → 403, no data_access → empty list
- Response shape matches Strapi output (minus removed fields)
- Pagination meta format identical
- No TypeScript compilation errors
