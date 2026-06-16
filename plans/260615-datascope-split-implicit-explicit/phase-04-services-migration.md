---
phase: 4
title: "Services Migration"
status: completed
priority: P1
effort: "6h"
dependencies: [1, 3]
---

# Phase 4: Services Migration

## Overview

Migrate all services consuming `accessibleDataIds?: number[]` sang `scope: DataScope | null` + helper `applyDataScope`. Tests first per method.

## Requirements

### Functional

Mỗi service method:
- Replace signature `(...args, accessibleDataIds?: number[])` → `(...args, scope: DataScope | null)`.
- Remove inline `if (accessibleDataIds?.length === 0) return []` early-return — helper handles `1 = 0`.
- Remove inline `accessibleDataIds.includes(id)` JS-side check — replace by SQL filter via helper.
- `findOne`-style methods → use SQL EXISTS or `getOne()` returning null + throw `NotFoundException` (404, không leak existence).
- `deleteMany`-style → filter ids via SQL `WHERE id = ANY(:requested) AND <scope predicate>` rồi soft-delete.

### Non-functional

- 0 trace của `accessibleDataIds` trong service files sau migration.
- All consumer specs updated trước impl.

## Architecture

### Migration matrix

| Method | Current pattern | New pattern |
|---|---|---|
| `findAll(query, accessibleDataIds)` | `qb.andWhere('id IN (:...ids)', { ids })` | `applyDataScope(qb, 'r', '<table>', scope)` |
| `findOne(id, accessibleDataIds)` | `if (!ids.includes(id)) throw NotFound` | `qb.where('id = :id').apply...getOne() ?? throw NotFound` |
| `update(id, dto, ids)` | JS-check then save | SQL filter then save (defense-in-depth) |
| `deleteMany(ids, accessibleIds)` | `ids.filter(i => accessibleIds.includes(i))` | `repo.createQueryBuilder().delete().where(scoped predicate).andWhereInIds(ids)` |
| `download(query, res, accessibleIds)` | inline check + andWhere | `applyDataScope` on qb |
| `increaseView(reportId, accessibleIds)` | inline includes | `qb.where + apply + getOne` then update |

### Code change examples

#### bi-hub-diagnostic-report.service.ts: findAll

```typescript
// BEFORE
async findAll(query: SearchDiagnosticReportDto, accessibleDataIds?: number[]) {
  if (accessibleDataIds && accessibleDataIds.length === 0) return { data: [] };
  const qb = this.repo.createQueryBuilder('report');
  // ... filters
  if (accessibleDataIds && accessibleDataIds.length > 0) {
    qb.andWhere('report.id IN (:...accessibleDataIds)', { accessibleDataIds });
  }
  return qb.getMany();
}

// AFTER
async findAll(query: SearchDiagnosticReportDto, scope: DataScope | null) {
  const qb = this.repo.createQueryBuilder('report');
  applyDataScope(qb, 'report', 'bi_hub_diagnostic_reports', scope);
  // ... filters
  return qb.getMany();
}
```

#### bi-hub-diagnostic-report.service.ts: findOne

```typescript
// BEFORE
async findOne(id: number, accessibleDataIds?: number[]) {
  if (accessibleDataIds && !accessibleDataIds.includes(id)) {
    throw new NotFoundException();
  }
  return this.repo.findOneByOrFail({ id });
}

// AFTER
async findOne(id: number, scope: DataScope | null) {
  const qb = this.repo.createQueryBuilder('report').where('report.id = :id', { id });
  applyDataScope(qb, 'report', 'bi_hub_diagnostic_reports', scope);
  const found = await qb.getOne();
  if (!found) throw new NotFoundException();
  return found;
}
```

#### bi-hub-diagnostic-report-write.service.ts: deleteMany

```typescript
// BEFORE
async deleteMany(idsStr: string, accessibleDataIds?: number[]) {
  const ids = idsStr.split(',').map(Number);
  const reports = await this.repo.findBy({ id: In(ids) });
  const deletableIds = accessibleDataIds
    ? reports.filter(r => accessibleDataIds.includes(r.id)).map(r => r.id)
    : reports.map(r => r.id);
  if (deletableIds.length === 0) return { deleted: 0 };
  await this.repo.softDelete({ id: In(deletableIds) });
  return { deleted: deletableIds.length, skipped: ids.length - deletableIds.length };
}

// AFTER
async deleteMany(idsStr: string, scope: DataScope | null) {
  const requestedIds = idsStr.split(',').map(Number);
  // SQL filter: chỉ chọn IDs (a) trong yêu cầu và (b) trong scope
  const qb = this.repo.createQueryBuilder('report')
    .select('report.id', 'id')
    .where('report.id = ANY(:ids)', { ids: requestedIds });
  applyDataScope(qb, 'report', 'bi_hub_diagnostic_reports', scope);
  const rows = await qb.getRawMany<{ id: number }>();
  const deletableIds = rows.map(r => r.id);
  if (deletableIds.length === 0) return { deleted: 0, skipped: requestedIds.length };
  await this.repo.softDelete({ id: In(deletableIds) });
  return { deleted: deletableIds.length, skipped: requestedIds.length - deletableIds.length };
}
```

#### bicc-department.service.ts: search

Tương tự `findAll` pattern. `tableName === rootTable` ở đây (`bi_hub_bicc_departments`) → helper chỉ apply OR trên `dept.id` (no JOIN).

## Related Code Files

### Modify
- `src/modules/bi-hub-diagnostic-report/bi-hub-diagnostic-report.service.ts` — 5 methods
- `src/modules/bi-hub-diagnostic-report/bi-hub-diagnostic-report-write.service.ts` — 4 methods
- `src/modules/bi-hub-diagnostic-report/diagnostic-transform-file.resolver.ts` — 2 methods + `assertCanAccess` helper
- `src/modules/bicc-department/bicc-department.service.ts` — 2 methods
- `src/common/transform-file/transform-file.types.ts` — `accessibleDataIds` → `dataScope` field

### Specs to update (tests-first)
- `src/modules/bi-hub-diagnostic-report/diagnostic-transform-file.resolver.spec.ts`
- (Add unit specs nếu chưa có cho `bi-hub-diagnostic-report.service`, `bicc-department.service`.)

## Implementation Steps (TDD per service)

Per service:
1. Update spec: thay `accessibleDataIds: [1,2]` → `scope: { explicit: [1,2], ownedRoots: null, denies: [] }`. Add owned-only case. Add admin (null) case.
2. Run spec → RED.
3. Replace method body theo pattern.
4. Run spec → GREEN.
5. `grep accessibleDataIds <service-file>` → should be empty.

Order trong phase này:
1. `bi-hub-diagnostic-report.service.ts` (read service).
2. `bi-hub-diagnostic-report-write.service.ts` (write service).
3. `diagnostic-transform-file.resolver.ts` (GraphQL resolver).
4. `bicc-department.service.ts`.
5. `transform-file.types.ts` field rename.

## Success Criteria

- [x] All migrated service methods accept `scope: DataScope | null` (findAll, findOne, findUpdatedUsers, findHistory, increaseView, update, deleteOne, deleteMany, download, search, details, transformReport, transformHistory).
- [x] `grep -rn accessibleDataIds src/modules` returns empty.
- [x] resolver spec passes (9 tests). bi-hub-diagnostic-report.service.ts and bicc-department.service.ts have no pre-existing unit specs — covered by integration spec + tsc.
- [x] `deleteMany` filters via SQL applyDataScope predicate before update (defense-in-depth). Concurrency unchanged from existing tx pattern.
- [x] `findOne` returns 404 in both cases (missing record + out-of-scope) — single QB with getOne().

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `deleteMany` SQL filter chạy SELECT rồi DELETE → race window | Existing behavior cũng có race (findBy → softDelete). Không degrade. Tx wrapper nếu cần (existing service pattern). |
| GraphQL resolver `assertCanAccess` private method dùng `accessibleDataIds.includes(reportId)` | Rewrite thành SQL existence check qua `applyDataScope` trong main query, không cần assert nữa. |
| Service consumer khác có thể đang dùng `accessibleDataIds` qua interface implicit | Grep audit trước commit, scan toàn codebase. |
| Test fixture cần update sang shape mới | Tạo helper `mkScope(opts)` trong `__tests__/test-utils/` để DRY. |
