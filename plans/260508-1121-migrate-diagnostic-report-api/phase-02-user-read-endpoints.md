---
phase: 2
title: User Read Endpoints
status: pending
priority: high
effort: 2.5h
---

# Phase 2 — User Read Endpoints (5 routes)

## Overview
Implement 5 user-facing read endpoints. All use `@RequirePermission('bh_diag_report_view')` + `@RequireDataAccess(BI_HUB_DIAGNOSTIC_REPORTS, 'bh_diag_report_view')`. Permission replaces old `getDiagnosticReportIDsPermission()` + `getDiagnosticReportIDsAdminPermission()` calls.

## Context Links
- Strapi source: `strapiv5-old/src/api/bi-hub-report/services/bi-diagnostic-user.ts`
- Entity: `src/modules/databases/bi-diagnostic-report.entity.ts`
- Pagination: `src/common/utils/common.ts` → `execQueryPaignation()`
- Permission: `src/common/authorization/interceptors/data-access.interceptor.ts`

## Permission Migration Pattern

**Old Strapi (REMOVE):**
```typescript
const reportIDsUserPermission = await getDiagnosticReportIDsPermission(user.groups);
const reportIDsAdminPermission = await getDiagnosticReportIDsAdminPermission(user.groupAdmins, user.adminId);
const reportIDsPermission = mergeArrays(reportIDsUserPermission, reportIDsAdminPermission);
conditionAnd.push({ id: { $in: reportIDsPermission } });
```

**New NestJS (ADD):**
```typescript
// Controller: decorator handles it
@RequirePermission('bh_diag_report_view')
@RequireDataAccess(DATA_ACCESS_TABLE.BI_HUB_DIAGNOSTIC_REPORTS, 'bh_diag_report_view')

// Service: filter by accessibleDataIds
if (accessibleDataIds && accessibleDataIds.length > 0) {
  qb.andWhere('report.id IN (:...accessibleDataIds)', { accessibleDataIds });
} else if (accessibleDataIds && accessibleDataIds.length === 0) {
  return { data: [], meta: { totalItems: 0, ... } };
}
```

---

## Endpoint 1: GET `/bi-hub/diagnostic-report`

**Strapi handler:** `findAllDiagnosticReport` (lines 207-345)

**Query params (match FE exactly):**
- `reportCategoryId` → now maps to `bicc_department_id` (category removed)
- `keyword` → ILIKE on name, summary, bu_name, txt_diagnostic_scope
- `sortField` → validate: `createdAt` | `total_view` | `updatedAt` (map to snake_case)
- `sortValue` → validate: `ASC` | `DESC`
- `page`, `limit` → pagination
- `labelIds` → comma-separated, filter via M:N join
- `reportStatus` → filter `diagnostic_report_status`

**Service method:**
```typescript
async findAll(
  query: SearchDiagnosticReportDto,
  page: number, limit: number,
  accessibleDataIds?: number[],
) {
  const qb = this.reportRepo.createQueryBuilder('report')
    .leftJoinAndSelect('report.labels', 'label')
    .leftJoinAndSelect('report.bi_hub_diagnostic_files', 'file', 'file.lastest_version = true')
    .leftJoinAndSelect('report.division', 'division')
    .leftJoinAndSelect('report.center', 'center')
    .leftJoinAndSelect('report.department', 'department')
    .where('report.deleted_at IS NULL')
    .andWhere('report.is_deleted = false');

  // Data access filtering (replaces old permission logic)
  if (accessibleDataIds?.length > 0) {
    qb.andWhere('report.id IN (:...accessibleDataIds)', { accessibleDataIds });
  } else if (accessibleDataIds?.length === 0) {
    return emptyPaginatedResult(page, limit);
  }

  // reportCategoryId → bicc_department_id
  if (query.reportCategoryId) {
    qb.andWhere('report.bicc_department_id = :deptId', { deptId: query.reportCategoryId });
  }

  // keyword search
  if (query.keyword?.trim()) {
    const kw = `%${query.keyword.trim()}%`;
    qb.andWhere('(report.name ILIKE :kw OR report.summary ILIKE :kw OR report.bu_name ILIKE :kw OR report.txt_diagnostic_scope ILIKE :kw)', { kw });
  }

  // label filter
  if (query.labelIds) {
    const ids = query.labelIds.split(',').map(Number).filter(Boolean);
    if (ids.length) qb.andWhere('label.id IN (:...labelIds)', { labelIds: ids });
  }

  // status filter
  if (query.reportStatus) {
    qb.andWhere('report.diagnostic_report_status = :status', { status: query.reportStatus });
  }

  // sort (map camelCase → snake_case: createdAt→created_at, updatedAt→updated_at)
  const sortMap = { createdAt: 'created_at', updatedAt: 'updated_at', total_view: 'total_view' };
  const sortCol = sortMap[query.sortField] || 'created_at';
  qb.orderBy(`report.${sortCol}`, query.sortValue as 'ASC' | 'DESC' || 'DESC');

  return execQueryPaignation(qb, page, limit);
}
```

**Response format** — must match `formatDiagnosticReport()`:
```typescript
// Transform each report to match Strapi response
private formatReport(report: BIHubDiagnosticReport) {
  const file = report.bi_hub_diagnostic_files?.[0] || null;
  return {
    ...report,
    diagnostic_scopes: report.txt_diagnostic_scope,
    bu_name: `${report.division?.name}_${report.center?.name}_${report.department?.name}`,
    file: file ? {
      url: ['POWER_BI', 'SUPERSET'].includes(file.type)
        ? `${file.file_url}?report_code=${report.code}`
        : `${TRANSFORM_USER_MEDIA}/${report.id}?model=${MediaTypeFile.BI_DIAGNOSTIC_REPORT}&report_code=${report.code}`,
      type: file.type,
    } : null,
    // Remove internal fields
    bi_hub_diagnostic_files: undefined,
    key_insights: undefined,
    txt_diagnostic_scope: undefined,
  };
}
```

---

## Endpoint 2: GET `/bi-hub/diagnostic-report/:id`

**Strapi handler:** `findOneDiagnosticReportById` (lines 346-408)

**Service:**
```typescript
async findOne(id: number, accessibleDataIds?: number[]) {
  // Permission check: verify id is in accessible list
  if (accessibleDataIds && !accessibleDataIds.includes(id)) {
    throw new ForbiddenException('No permission');
  }

  const report = await this.reportRepo.findOne({
    where: { id, is_deleted: false },
    relations: ['labels', 'bi_hub_diagnostic_files', 'division', 'center', 'department', 'bicc_department', 'scopes'],
  });
  if (!report) throw new NotFoundException('Report not found');

  // Filter files to latest version only
  report.bi_hub_diagnostic_files = report.bi_hub_diagnostic_files?.filter(f => f.lastest_version) || [];

  return this.formatReport(report);
}
```

**Response:** Same `formatReport()` but includes: `bicc_department`, `labels`, `scopes`, `createdBy`, `updatedBy`.

---

## Endpoint 3: GET `/bi-hub/diagnostic-report/updated-user`

**Strapi handler:** `findAllUpdatedUserByDiagnosticReportId` (lines 409-479)

**Query params:** `reportId` (required), `keyword`, `sortField` (created_at only), `sortValue`, `page`, `limit`

**Service:** Raw SQL query (complex join, keep similar to Strapi):
```typescript
async findUpdatedUsers(query: SearchUpdatedUserDto, accessibleDataIds?: number[]) {
  // Permission check
  if (accessibleDataIds && !accessibleDataIds.includes(+query.reportId)) {
    throw new ForbiddenException('No permission');
  }

  // Raw query: find distinct users who updated this report's history
  const sql = `
    SELECT DISTINCT ON (u.email) u.id, u.email
    FROM users u
    INNER JOIN bi_hub_diagnostic_history_reports h
      ON h.updated_by = u.id
    WHERE h.bi_hub_diagnostic_report_id = $1
      AND u.deleted_at IS NULL
      AND LOWER(u.email) LIKE $2
    ORDER BY u.email, u.created_at ${query.sortValue}
    LIMIT $3 OFFSET $4
  `;

  const countSql = `
    SELECT COUNT(DISTINCT u.id) as count
    FROM users u
    INNER JOIN bi_hub_diagnostic_history_reports h
      ON h.updated_by = u.id
    WHERE h.bi_hub_diagnostic_report_id = $1
      AND u.deleted_at IS NULL
      AND LOWER(u.email) LIKE $2
  `;
  // Execute both, return with pagination meta
}
```

**Note:** Strapi queries `admin_users` table → NestJS uses `users` table (unified auth).

---

## Endpoint 4: GET `/bi-hub/diagnostic-report/history`

**Strapi handler:** `findAllDiagnosticHistoryReport` (lines 480-590)

**Query params:** `reportId` (required), `updatedByIds` (comma-separated), `isLinkReportChange`, `sortField`, `sortValue`, `keyword`, `page`, `limit`

**Service:**
```typescript
async findHistory(query: SearchDiagnosticHistoryDto, accessibleDataIds?: number[]) {
  // Permission check
  if (accessibleDataIds && !accessibleDataIds.includes(+query.reportId)) {
    throw new ForbiddenException('No permission');
  }

  const qb = this.historyRepo.createQueryBuilder('h')
    .leftJoinAndSelect('h.bi_hub_diagnostic_report', 'report')
    .where('h.deleted_at IS NULL')
    .andWhere('h.bi_hub_diagnostic_report_id = :reportId', { reportId: query.reportId })
    .andWhere('report.is_deleted = false');

  if (query.keyword?.trim()) {
    qb.andWhere('h.name ILIKE :kw', { kw: `%${query.keyword.trim()}%` });
  }
  if (query.isLinkReportChange !== undefined) {
    qb.andWhere('h.is_change_link = :isChange', { isChange: query.isLinkReportChange });
  }
  if (query.updatedByIds) {
    const ids = query.updatedByIds.split(',').map(Number).filter(Boolean);
    if (ids.length) qb.andWhere('h.updated_by IN (:...updatedByIds)', { updatedByIds: ids });
  }

  // Sort mapping
  const sortMap = { createdAt: 'created_at', name: 'name', updatedAt: 'updated_at' };
  qb.orderBy(`h.${sortMap[query.sortField] || 'created_at'}`, query.sortValue as 'ASC' | 'DESC');

  return execQueryPaignation(qb, query.page, query.limit);
}
```

**Response transform:** `formatHistoryDiagnosticReport()` — file URL construction based on type.

---

## Endpoint 5: POST `/bi-hub/diagnostic-report/view`

**Strapi handler:** `increaseViewReport` (lines 911-967)

**Body:** `{ reportId: number }`

**Service:**
```typescript
async increaseView(reportId: number, accessibleDataIds?: number[]) {
  if (accessibleDataIds && !accessibleDataIds.includes(reportId)) {
    throw new ForbiddenException('No permission');
  }

  const report = await this.reportRepo.findOne({ where: { id: reportId } });
  if (!report) throw new NotFoundException('Report not found');

  await this.reportRepo.update(reportId, {
    total_view: () => 'total_view + 1',
  });

  return { id: report.id, total_view: (report.total_view || 0) + 1 };
}
```

---

## Todo
- [ ] Implement `findAll` with data access filtering
- [ ] Implement `findOne` with permission check
- [ ] Implement `findUpdatedUsers` with raw SQL
- [ ] Implement `findHistory` with QueryBuilder
- [ ] Implement `increaseView`
- [ ] Implement `formatReport()` matching Strapi output
- [ ] Implement `formatHistoryReport()` matching Strapi output
- [ ] Wire all 5 endpoints in user controller
- [ ] Compile check

## Success Criteria
- All 5 endpoints return correct response format matching FE expectations
- Data access filtering works: users only see reports they have access to
- Pagination meta format matches: `{ totalItems, itemCount, itemsPerPage, totalPages, currentPage }`
- Sort/filter params work exactly as Strapi
