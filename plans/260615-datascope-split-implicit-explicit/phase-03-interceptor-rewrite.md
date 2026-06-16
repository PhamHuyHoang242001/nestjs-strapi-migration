---
phase: 3
title: "Interceptor Rewrite"
status: completed
priority: P1
effort: "3h"
dependencies: [1, 2]
---

# Phase 3: Interceptor Rewrite

## Overview

Rewrite `DataAccessInterceptor` to populate `req.info.dataScope: DataScope | null` instead of `req.info.accessibleDataIds: number[]`. Output shape compose từ:
- `permissionCache.getAccessibleRecords` (cached explicit grants).
- `ownerScope.getOwnedRoots` (cached root IDs, no leaf expansion).
- `permissionCache.getOverrideOwnerDenies` (cached deny list).

## Requirements

### Functional

- Admin client (`req.info.client === 'admin'`) → `req.info.dataScope = null`.
- Non-admin user:
  - `findRootTable(meta.tableName)` returns rootTable hoặc null.
  - 3 fetches `Promise.all([explicit, ownedRootIds, denies])`.
  - Output:
    ```ts
    req.info.dataScope = {
      explicit,
      ownedRoots: (ownedRootIds.length > 0 && rootTable) ? { rootTable, rootIds: ownedRootIds } : null,
      denies,
    };
    ```
- Missing user (no userId) → `ForbiddenException`.
- `req.info.accessibleDataIds` KHÔNG còn được set bởi interceptor.

### Non-functional

- 3 fetches chạy parallel (Promise.all).
- File interceptor ≤ 80 lines.

## Architecture

### Files

```
src/common/authorization/interceptors/data-access.interceptor.ts             [REWRITE]
src/common/authorization/__tests__/data-access-interceptor-with-owner.spec.ts [REWRITE]
src/common/types/request-with-info.ts                                         [MODIFY: add dataScope field]
```

### Diff sketch

```typescript
// data-access.interceptor.ts (final)
import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { RequestWithInfo } from '@common/types/request-with-info';
import { DATA_ACCESS_META_KEY } from '../constants/authorization.constant';
import { DataAccessMeta } from '../decorators/require-data-access.decorator';
import { findRootTable } from '@modules/data-access/helpers/owner-scope-helpers';
import { OwnerScopeResolverService } from '../services/owner-scope-resolver.service';
import { PermissionCacheService } from '../services/permission-cache.service';

@Injectable()
export class DataAccessInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionCache: PermissionCacheService,
    private readonly ownerScope: OwnerScopeResolverService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const meta = this.reflector.getAllAndOverride<DataAccessMeta | undefined>(DATA_ACCESS_META_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<RequestWithInfo>();
    if (req.info?.client === 'admin') {
      req.info.dataScope = null;
      return next.handle();
    }

    const userId = Number(req.info?.user?.id);
    if (!userId) throw new ForbiddenException('User not authenticated');

    const rootTable = findRootTable(meta.tableName);
    const [explicit, ownedRootIds, denies] = await Promise.all([
      this.permissionCache.getAccessibleRecords(userId, meta.tableName, meta.permissionCode),
      rootTable ? this.ownerScope.getOwnedRoots(userId, rootTable) : Promise.resolve([] as number[]),
      this.permissionCache.getOverrideOwnerDenies(userId, meta.tableName, meta.permissionCode),
    ]);

    req.info.dataScope = {
      explicit,
      ownedRoots: ownedRootIds.length > 0 && rootTable ? { rootTable, rootIds: ownedRootIds } : null,
      denies,
    };
    return next.handle();
  }
}
```

### RequestWithInfo type change

```typescript
// src/common/types/request-with-info.ts
// REMOVE: accessibleDataIds?: number[];
// ADD:    dataScope?: DataScope | null;
```

## Related Code Files

### Modify
- `src/common/authorization/interceptors/data-access.interceptor.ts`
- `src/common/types/request-with-info.ts`
- `src/common/authorization/authorization.module.ts` (cập nhật comment line 15)
- `src/common/authorization/__tests__/data-access-interceptor-with-owner.spec.ts`

## Implementation Steps (TDD)

1. **Update spec first**:
   - Test admin path → `req.info.dataScope = null`.
   - Test user no owner, only explicit → `dataScope.ownedRoots = null, explicit = [1, 2]`.
   - Test user only owner, no explicit grant → `dataScope.explicit = [], ownedRoots = { rootTable: '...', rootIds: [5] }`.
   - Test user both → both populated.
   - Test user nothing → `{ explicit: [], ownedRoots: null, denies: [] }`.
   - Test user with denies → `denies = [99]`.
   - Test missing userId → throw `ForbiddenException`.
   - Test tableName không có rootTable → `ownedRoots = null` (resolver not called).
   - Verify 3 cache calls parallel (mock + assert `Promise.all` invocation).
2. **Run** → RED.
3. **Modify `RequestWithInfo`**: thêm `dataScope`, để tạm `accessibleDataIds` không xóa (xóa ở Phase 5 sau khi services migrate xong).
4. **Rewrite interceptor** theo sketch.
5. **Run** → GREEN.

## Success Criteria

- [x] Interceptor không còn gọi `getOwnerScopedIds`.
- [x] `req.info.dataScope` đúng shape trong 12 test cases (9 dataScope shape + admin/auth + parallel timing + non-HIERARCHY table).
- [x] Cache fetches parallel — verified via mock timing assertion (elapsed < 120ms for 3 × 40ms mocks).
- [x] tsc strict pass.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Services trong Phase 4 vẫn còn đọc `accessibleDataIds` chưa migrate | OK, giữ field tạm trong `RequestWithInfo` (chưa xóa). Interceptor không set nữa → các service đó tự nhiên thấy `undefined` → fail soft (admin behavior). Phase 4-5 migrate hết. |
| Race condition tests dùng mock không catch được parallel | Dùng `jest.fn().mockImplementation(() => sleep(N).then(() => result))` với khoảng thời gian khác nhau, đo total elapsed < sum. |
