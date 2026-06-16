---
phase: 5
title: "Controllers and Request Cleanup"
status: completed
priority: P1
effort: "2h"
dependencies: [4]
---

# Phase 5: Controllers and Request Cleanup

## Overview

Forward `req.info?.dataScope` to services thay vì `req.info?.accessibleDataIds`. Delete `accessibleDataIds` field khỏi `RequestWithInfo` và `transform-file.types`. Final cleanup — sau phase này không còn 1 ref nào của `accessibleDataIds`.

## Requirements

### Functional

- Tất cả controller method gọi `service.X(..., req.info?.accessibleDataIds)` → `service.X(..., req.info?.dataScope ?? null)`.
- Type `RequestWithInfo.accessibleDataIds` removed.
- Type `TransformFileRequest.accessibleDataIds` removed (file `transform-file.types.ts`).
- Build pass: tsc strict không còn ref nào.

### Non-functional

- Cleanup chỉ touch controllers + types, không touch services (đã xong Phase 4).
- `grep -rn accessibleDataIds src/` → completely empty sau phase này.

## Architecture

### Diff per controller

```typescript
// bi-hub-diagnostic-report-admin.controller.ts (BEFORE/AFTER)
// BEFORE
return this.service.update(+id, body, +userId, req.info?.accessibleDataIds);

// AFTER
return this.service.update(+id, body, +userId, req.info?.dataScope ?? null);
```

Apply tương tự cho:
- `bi-hub-diagnostic-report-admin.controller.ts` — 4 endpoints (download, update, deleteMany, deleteOne)
- `bi-hub-diagnostic-report-user.controller.ts` — 5 endpoints (findAll, findUpdatedUsers, findHistory, increaseView, findOne)
- `bicc-department.controller.ts` — 2 endpoints (search, details)

### Type cleanup

```typescript
// src/common/types/request-with-info.ts
// REMOVE: accessibleDataIds?: number[];
// (dataScope?: DataScope | null đã thêm ở Phase 3, giữ.)

// src/common/transform-file/transform-file.types.ts
// REMOVE: accessibleDataIds?: number[];
// ADD:    dataScope?: DataScope | null;  (đã được resolver dùng từ Phase 4)
```

## Related Code Files

### Modify
- `src/modules/bi-hub-diagnostic-report/bi-hub-diagnostic-report-admin.controller.ts`
- `src/modules/bi-hub-diagnostic-report/bi-hub-diagnostic-report-user.controller.ts`
- `src/modules/bicc-department/bicc-department.controller.ts`
- `src/common/types/request-with-info.ts`
- `src/common/transform-file/transform-file.types.ts`
- `src/common/authorization/authorization.module.ts` (final comment cleanup)

## Implementation Steps

1. **Update spec test fixtures** (controller layer + e2e): replace `req.info.accessibleDataIds` mock với `req.info.dataScope`.
2. Run controller specs → RED nếu controllers vẫn pass cũ shape.
3. **Replace 11 controller call sites** (4 + 5 + 2).
4. **Remove `accessibleDataIds` từ `RequestWithInfo`**.
5. **Remove `accessibleDataIds` từ `transform-file.types.ts`**, add `dataScope`.
6. Run tsc → PASS (mọi consumer đã migrate).
7. `grep -rn accessibleDataIds src/` → empty.
8. Run full unit test suite → all green.

## Success Criteria

- [x] 0 occurrence of `accessibleDataIds` in `src/` outside the interceptor-spec regression guard test (asserts the field is never re-introduced at runtime).
- [x] 11 controller endpoints forward `req.info?.dataScope ?? null` (4 admin + 5 user + 2 bicc-department).
- [x] tsc strict pass.
- [x] Full jest suite: 277/281 pass; 4 failures are pre-existing in creator-access-grant.service.spec.ts (verified via stash, unrelated to this plan).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| 1 controller bị miss → runtime `req.info.dataScope === undefined` ở service kỳ vọng `null` | Service signature `scope: DataScope \| null` không có optional default → tsc bắt được nếu undefined passed. |
| Type `RequestWithInfo` được consume bởi nhiều phần code khác (auth guards, middlewares) | Tsc bắt được toàn bộ — nếu fail, fix cùng PR. Không expected mở rộng nhiều. |
