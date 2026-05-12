---
phase: 4
title: BICC Department Helper Endpoints
status: pending
priority: medium
effort: 0.5h
---

# Phase 4 — BICC Department Helper Endpoints (2 routes)

## Overview
Add 2 endpoints to existing `BiccDepartmentController`. These are user-facing lookup helpers related to diagnostic context.

## Context Links
- Existing controller: `src/modules/bicc-department/bicc-department.controller.ts`
- Existing service: `src/modules/bicc-department/bicc-department.service.ts`
- Strapi source: `strapiv5-old/src/api/bi-hub-report/services/bi-diagnostic-user.ts` (lines 139-206)

---

## Endpoint 12: GET `/bi-hub/bicc-department/admin`

**Strapi handler:** `findAdminByBiccDepartmentId` (lines 139-167)

**Purpose:** Find admin users associated with a BICC department (via diagnostic reports).

**Query params:** `biccDepartmentId` (required), `keyword`, `page`, `limit`

**Note:** Route path `/bi-hub/bicc-department/admin` doesn't match controller prefix `v1/bicc-department`. Two options:

**Option A (recommended):** Add a separate thin controller with exact Strapi path.
```typescript
@Controller('bi-hub/bicc-department')
export class BiccDepartmentUserController {
  @Get('admin')
  @RequirePermission('bh_bicc_dept_view')
  findAdminByDept(@Query() query) { ... }

  @Get('scope')
  @RequirePermission('bh_bicc_dept_view')
  findScopeByDept(@Query() query) { ... }
}
```

**Option B:** Add routes to existing controller with full path override `@Get('/bi-hub/bicc-department/admin')`. Less clean.

**Service (add to BiccDepartmentService or DiagnosticReportService):**
```typescript
async findAdminByDepartment(biccDepartmentId: number, keyword: string, page: number, limit: number) {
  // Raw SQL: find distinct users linked to reports under this department
  const sql = `
    SELECT DISTINCT ON (u.id) u.id, u.email
    FROM users u
    INNER JOIN bi_hub_diagnostic_reports r
      ON r.created_by = u.id
    WHERE r.bicc_department_id = $1
      AND r.is_deleted = false
      AND r.deleted_at IS NULL
      AND u.deleted_at IS NULL
      AND LOWER(u.email) LIKE $2
    ORDER BY u.id
    LIMIT $3 OFFSET $4
  `;
  // + count query for pagination
}
```

**Note:** Strapi version queried via category → department link. Since category is removed, query directly via `bicc_department_id` on reports.

---

## Endpoint 13: GET `/bi-hub/bicc-department/scope`

**Strapi handler:** `findScopeBiccDepartmentId` (lines 169-206)

**Purpose:** Find diagnostic scopes belonging to a BICC department.

**Query params:** `biccDepartmentId` (required), `keyword`

**Service:**
```typescript
async findScopeByDepartment(biccDepartmentId: number, keyword?: string) {
  const qb = this.scopeRepo.createQueryBuilder('scope')
    .where('scope.bicc_department_id = :deptId', { deptId: biccDepartmentId })
    .andWhere('scope.scope_status = :status', { status: 'active' })
    .andWhere('scope.deleted_at IS NULL');

  if (keyword?.trim()) {
    const kw = `%${keyword.trim()}%`;
    qb.andWhere('(scope.name ILIKE :kw OR scope.description ILIKE :kw)', { kw });
  }

  const scopes = await qb.getMany();
  return scopes.map(s => ({ id: s.id, name: s.name, description: s.description }));
}
```

---

## Implementation Decision

These 2 endpoints use path `/bi-hub/bicc-department/*` which differs from existing controller prefix `v1/bicc-department/*`. Create a **separate controller** in `bicc-department` module with the Strapi-compatible prefix, or place in `bi-hub-diagnostic-report` module since they support diagnostic context.

**Recommended:** Place in `bi-hub-diagnostic-report.module.ts` as a separate small controller since they serve diagnostic workflows. Inject `BiHubDiagnosticScope` repo there.

---

## Todo
- [ ] Create controller with `/bi-hub/bicc-department` prefix
- [ ] Implement findAdminByDepartment
- [ ] Implement findScopeByDepartment
- [ ] Register controller in appropriate module
- [ ] Compile check

## Success Criteria
- GET `/bi-hub/bicc-department/admin?biccDepartmentId=X` returns paginated user list
- GET `/bi-hub/bicc-department/scope?biccDepartmentId=X` returns scope list
- Response format matches Strapi output
