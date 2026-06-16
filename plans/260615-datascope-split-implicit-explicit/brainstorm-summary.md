# Brainstorm Summary — Split DataScope into Implicit (Owned Roots) vs Explicit (Granted IDs)

**Date:** 2026-06-15
**Status:** Approved — ready for `/ck:plan --tdd`
**Author:** Architect (brainstorm session)
**Supersedes:** §4 Read endpoint + §7 Service layer of `docs/so-permission-guide.html` (need rewrite after impl)

---

## 1. Problem Statement

Hậu quả của SO Owner Implicit Permission ship 2026-06-12: `DataAccessInterceptor` rải HẾT leaf record IDs (transitively owned via root) vào 1 mảng phẳng `req.info.accessibleDataIds`, sau đó service áp dụng `WHERE id IN (:...accessibleDataIds)`.

### Failure modes

| # | Issue | Impact |
|---|---|---|
| 1 | Owner 1 workspace có 10k+ documents → array 10k IDs/request | Wire + bind cost O(n); cache value Redis phình |
| 2 | PG IN-list lớn → query planner switch sang seq scan ở ~5k-10k params | Latency cliff |
| 3 | Snapshot leaf IDs tại T₀, query thực tại T₁ → race window: docs tạo giữa T₀-T₁ không thấy | Correctness bug |
| 4 | Trộn 2 nguồn quyền (explicit grant + owner) vào 1 array → mất audit context | Audit-log Phase 5 không trace được "via owner" vs "via grant" |
| 5 | Mọi request có `@RequireDataAccess` chạy SQL JOIN-down vào leaf table | Hot path scaling kém |

### Bản chất

Đây là anti-pattern **transitive closure materialization** thay vì **predicate pushdown**.

---

## 2. Evaluated Approaches

### A. Split DataScope (CHỌN)
- Thay `accessibleDataIds: number[]` bằng `DataScope { explicit, ownedRoots, denies }`.
- Helper `applyDataScope()` đọc `HIERARCHY_MAP`, emit JOIN-up + OR predicate.
- Service gọi 1 dòng: `applyDataScope(qb, alias, tableName, scope)`.

| Pros | Cons |
|---|---|
| Loại bỏ materialization, IN-list nhỏ (bounded) | Helper cần biết hierarchy → tight coupling với `data-access` module |
| Loại bỏ race window correctness | Service thêm JOIN-up → cần FK index (user tự thêm) |
| Audit-log có nguồn quyền rõ ràng | API surface đổi → 13 file refactor |
| Áp dụng được cho mọi root sau này không sửa thêm | |

### B. Inline subquery — không cache
```sql
WHERE id = ANY(:explicit)
   OR workspace_id IN (
     SELECT ro.resource_id FROM resource_owners ro
     INNER JOIN user_roles ur ON ur.role_id = ro.role_id
     WHERE ur.user_id = :uid AND ro.resource_type = 'workspace'
   )
```
| Pros | Cons |
|---|---|
| Không cần cache, 1 query duy nhất, không stale | Mỗi read = thêm 2 JOIN vào main query — cache `userOwnerScope` hiện tại đang hữu ích, vứt đi tiếc |
| Auto-refresh khi owner role thay đổi | Khó áp dụng cho table > 1-hop dưới root |

**Reject:** Vứt cache hiện tại không cần thiết. Approach A cho cùng kết quả mà giữ cache.

### C. CTE materialized view per-user
Pre-compute owned subtree thành view per-user.
**Reject:** Stale propagation phức tạp, YAGNI.

### D. Keep current + pagination
Cap leaf list ở N records.
**Reject:** Vỡ correctness (user thấy thiếu records).

### E. PostgreSQL Row-Level Security
**Reject:** Đại refactor, mất control trong service layer, YAGNI cho lúc này.

---

## 3. Recommended Solution

### 3.1 Type `DataScope`

```typescript
// src/common/authorization/types/data-scope.types.ts
export interface DataScope {
  explicit: number[];                                            // per-record admin grants
  ownedRoots: { rootTable: string; rootIds: number[] } | null;   // root IDs user owns
  denies: number[];                                              // override_owner kill-switch
}
// admin path → req.info.dataScope = null
```

**Semantic invariants:**
- `null` = admin path, không apply filter.
- `explicit.length === 0 && ownedRoots === null` = user thấy gì cũng không → `WHERE 1=0`.
- `denies` AND-NOT áp dụng SAU OR clause → admin block thắng owner scope.

### 3.2 Resolver thay đổi

| File | Action |
|---|---|
| `owner-scope-resolver.service.ts` `getOwnerScopedIds()` (line 124-164) | **DELETE** |
| `owner-scope-resolver.service.ts` | **ADD** `getOwnedRoots(userId, rootTable): Promise<number[]>` — đọc cache `getUserOwnerScope`, filter theo rootTable |
| `getUserOwnerScope`, `getUserImpliedVerbs`, `isInOwnedScope` | giữ nguyên, đã đúng |

### 3.3 Interceptor

```typescript
// data-access.interceptor.ts
async intercept(...) {
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
    rootTable ? this.ownerScope.getOwnedRoots(userId, rootTable) : [],
    this.permissionCache.getOverrideOwnerDenies(userId, meta.tableName, meta.permissionCode),
  ]);

  req.info.dataScope = {
    explicit,
    ownedRoots: ownedRootIds.length > 0 && rootTable ? { rootTable, rootIds: ownedRootIds } : null,
    denies,
  };
  return next.handle();
}
```

### 3.4 Helper `applyDataScope`

```typescript
// src/modules/data-access/helpers/data-scope-applier.ts
import { SelectQueryBuilder } from 'typeorm';
import { HIERARCHY_MAP } from '../constants/hierarchy-config';
import type { DataScope } from '@common/authorization/types/data-scope.types';

export function applyDataScope<T>(
  qb: SelectQueryBuilder<T>,
  rootAlias: string,
  tableName: string,
  scope: DataScope | null,
): void {
  if (scope === null) return;                            // admin

  const noExplicit = scope.explicit.length === 0;
  const noOwned = scope.ownedRoots === null;

  if (noExplicit && noOwned) {
    qb.andWhere('1 = 0');
    return;
  }

  const suffix = randomSuffix(8);                        // tránh param collision khi nested
  const orClauses: string[] = [];

  if (!noExplicit) {
    const p = `dsExplicit_${suffix}`;
    qb.setParameter(p, scope.explicit);
    orClauses.push(`${rootAlias}.id = ANY(:${p})`);
  }

  if (!noOwned) {
    const { rootTable, rootIds } = scope.ownedRoots!;
    const chain = walkUp(tableName, rootTable);          // build từ HIERARCHY_MAP
    if (chain !== null) {
      const lastAlias = appendJoinChain(qb, rootAlias, chain, suffix);  // INNER JOIN up to root
      const p = `dsOwned_${suffix}`;
      qb.setParameter(p, rootIds);
      orClauses.push(`${lastAlias}.id = ANY(:${p})`);
    }
  }

  if (orClauses.length === 0) {
    qb.andWhere('1 = 0');
    return;
  }
  qb.andWhere(`(${orClauses.join(' OR ')})`);

  if (scope.denies.length > 0) {
    const p = `dsDeny_${suffix}`;
    qb.setParameter(p, scope.denies);
    qb.andWhere(`${rootAlias}.id <> ALL(:${p})`);
  }
}
```

**Helper internals (sub-functions cùng file):**
- `walkUp(tableName, rootTable)` → chain `[{ childTable, parentTable, fkColumn }, ...]` hoặc `null` nếu không reach.
- `appendJoinChain(qb, rootAlias, chain, suffix)` → emit `qb.innerJoin('parent_table', '__ds_t1_<suffix>', '__ds_t1_<suffix>.id = <child>.fkColumn AND __ds_t1_<suffix>.deleted_at IS NULL')` cho từng hop, return alias cuối cùng.
- `randomSuffix(n)` → `Math.random().toString(36).slice(2, 2+n)`.

**Naming convention:** alias internal bắt đầu bằng `__ds_` → consumer KHÔNG dùng prefix này.

### 3.5 Service pattern duy nhất

```typescript
// READ list
async findAll(query, scope: DataScope | null) {
  const qb = this.repo.createQueryBuilder('report');
  applyDataScope(qb, 'report', 'bi_hub_diagnostic_reports', scope);
  // ... pagination, sort, search filters
  return qb.getMany();
}

// READ details — không cần JS-side check existence
async findOne(id: number, scope: DataScope | null) {
  const qb = this.repo.createQueryBuilder('report').where('report.id = :id', { id });
  applyDataScope(qb, 'report', 'bi_hub_diagnostic_reports', scope);
  const found = await qb.getOne();
  if (!found) throw new NotFoundException();
  return found;
}

// WRITE update — OwnerScopeGuard đã check rồi, service chỉ cần fetch
async update(id: number, dto, userId, scope: DataScope | null) {
  // OwnerScopeGuard đã chặn write trái phép. Defense-in-depth: vẫn dùng SQL filter.
  const qb = this.repo.createQueryBuilder('report').where('report.id = :id', { id });
  applyDataScope(qb, 'report', 'bi_hub_diagnostic_reports', scope);
  const record = await qb.getOne();
  if (!record) throw new NotFoundException();
  Object.assign(record, dto);
  return this.repo.save(record);
}
```

### 3.6 Refactor scope

| File | Change |
|---|---|
| `common/authorization/types/data-scope.types.ts` | **NEW** |
| `common/types/request-with-info.ts` | `accessibleDataIds?: number[]` → `dataScope?: DataScope \| null` |
| `common/transform-file/transform-file.types.ts` | same |
| `common/authorization/interceptors/data-access.interceptor.ts` | rewrite output |
| `common/authorization/services/owner-scope-resolver.service.ts` | DELETE `getOwnerScopedIds`; ADD `getOwnedRoots` |
| `common/authorization/authorization.module.ts` | update comment line 15 |
| `common/authorization/index.ts` | export `DataScope` type |
| `modules/data-access/helpers/data-scope-applier.ts` | **NEW** |
| `modules/bi-hub-diagnostic-report/bi-hub-diagnostic-report.service.ts` | replace 4 methods (`findAll`, `findOne`, `findUpdatedUsers`, `findHistory`, `increaseView`) |
| `modules/bi-hub-diagnostic-report/bi-hub-diagnostic-report-write.service.ts` | replace 4 methods (`update`, `deleteOne`, `deleteMany`, `download`) |
| `modules/bi-hub-diagnostic-report/diagnostic-transform-file.resolver.ts` | replace `accessibleDataIds` flow |
| `modules/bi-hub-diagnostic-report/bi-hub-diagnostic-report-admin.controller.ts` | thay `req.info?.accessibleDataIds` → `req.info?.dataScope` |
| `modules/bi-hub-diagnostic-report/bi-hub-diagnostic-report-user.controller.ts` | same |
| `modules/bicc-department/bicc-department.service.ts` | replace 2 methods (`search`, `details`) |
| `modules/bicc-department/bicc-department.controller.ts` | thay reference |
| `docs/so-permission-guide.html` §4, §7 | rewrite (sau impl) |
| `__tests__/data-access-interceptor-with-owner.spec.ts` | update assertions |
| `__tests__/so-owner-scope-integration.spec.ts` | update |
| `modules/bi-hub-diagnostic-report/diagnostic-transform-file.resolver.spec.ts` | update |

**Total:** ~14 source files + 3 test files + 1 doc.

---

## 4. Implementation Considerations

### 4.1 TDD ordering (cho `/ck:plan --tdd`)

1. **Phase 1 — Types + helper unit tests**
   - Define `DataScope` type.
   - Write unit tests cho `applyDataScope`: admin null, see-nothing, explicit only, owned only, both, denies, root === tableName, multi-hop chain (`ma_tool_documents` → `ma_tool_templates` → `ma_tool_workspaces`).
   - Implement helper.

2. **Phase 2 — Resolver**
   - Update existing `owner-scope-resolver.service.spec.ts`: remove `getOwnerScopedIds` tests, add `getOwnedRoots` tests.
   - Delete + add methods.

3. **Phase 3 — Interceptor**
   - Update `data-access-interceptor-with-owner.spec.ts`: assert `req.info.dataScope` shape instead of `accessibleDataIds`.
   - Rewrite interceptor.

4. **Phase 4 — Service migration (per module)**
   - Update service specs first, then service impls.
   - `bi-hub-diagnostic-report` cluster (4 file).
   - `bicc-department` cluster (2 file).

5. **Phase 5 — Controllers + types**
   - Update controllers to forward `req.info?.dataScope`.
   - Remove `accessibleDataIds` from `RequestWithInfo` + `transform-file.types`.

6. **Phase 6 — Integration test + docs**
   - Update `so-owner-scope-integration.spec.ts` end-to-end.
   - Rewrite `docs/so-permission-guide.html` §4 + §7.

### 4.2 Edge cases test coverage bắt buộc

- ✅ Admin path: `dataScope = null` → no filter, full list.
- ✅ User no explicit, no owned: `{ explicit: [], ownedRoots: null, denies: [] }` → empty result.
- ✅ User explicit only (no owner role): list = explicit records.
- ✅ User owner only (no explicit grant): list = records under owned roots.
- ✅ User both: union, no duplicate.
- ✅ Owner table itself queried (e.g. `bicc-department/search`): `tableName === rootTable` → predicate trên `rootAlias.id`.
- ✅ Multi-hop: `ma_tool_documents` query với `ownedRoots.rootTable = 'ma_tool_workspaces'` → 2 INNER JOIN tự sinh.
- ✅ Denies: explicit + owned − denies → record bị deny không hiện kể cả thuộc owned.
- ✅ findOne returns 404 (không 403) cho record không có quyền — không leak existence.
- ✅ Table không thuộc `HIERARCHY_MAP` (vd table độc lập future): `findRootTable` return null → `ownedRoots = null` → behavior chỉ dựa explicit (giống trước SO).

---

## 5. Risks

| Risk | Mức | Mitigation |
|---|---|---|
| **FK columns chưa có index** → JOIN-up chậm trên bảng lớn | 🔴 High | User tự thêm migration index sau. Document risk trong PR description. **Code đúng nhưng cần index để scale.** |
| Service phức tạp có sẵn JOIN trùng alias `__ds_*` | 🟡 Med | Convention: cấm consumer dùng prefix `__ds_`. Helper dùng random suffix. |
| Refactor 13+ file 1 PR → review khó | 🟡 Med | TDD per phase + PR commit log có cấu trúc theo phase |
| Owner scope cache `userOwnerScope:{userId}` stale khi role thay đổi | 🟢 Low (đã có) | Invalidation hiện tại đã wire qua `RoleService.saveOwnerAssignments`; không touch |
| Future tables outside current `HIERARCHY_MAP` → unintended behavior | 🟢 Low | Test case "table not in map" cover scenario |

---

## 6. Success Metrics

### Correctness (hard requirements)
- [ ] All existing integration tests pass.
- [ ] Edge cases section 4.2 covered.
- [ ] `findOne` returns 404 (not 403) for non-accessible record.

### Code quality
- [ ] No occurrence of `accessibleDataIds` remaining (`grep -r accessibleDataIds src/` → empty).
- [ ] No occurrence of `getOwnerScopedIds`.
- [ ] All services use `applyDataScope` helper, không tự viết predicate.

### Operational (post-deploy, user verify)
- [ ] PG `EXPLAIN ANALYZE` `SELECT * FROM ma_tool_documents WHERE ...` với owner-rooted user: query plan NÊN dùng Index Scan trên `ma_tool_documents.template_id` (nếu user đã add index).
- [ ] Redis cache size cho `userOwnerScope:*` không tăng tuyến tính với #records (chỉ tuyến tính với #owner roles).

---

## 7. Next Steps

1. **Now:** Pass this doc to `/ck:plan --tdd` to produce phased plan.
2. **After plan:** Implement following TDD order (Phase 1-6).
3. **User responsibility (outside this scope):** Add migration creating partial indexes on FK columns. Suggest:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_ma_tool_documents_template_id
     ON ma_tool_documents (template_id) WHERE deleted_at IS NULL;
   CREATE INDEX IF NOT EXISTS idx_ma_tool_templates_workspace_id
     ON ma_tool_templates (workspace_id) WHERE deleted_at IS NULL;
   CREATE INDEX IF NOT EXISTS idx_bi_hub_diagnostic_reports_bicc_department_id
     ON bi_hub_diagnostic_reports (bicc_department_id) WHERE deleted_at IS NULL;
   CREATE INDEX IF NOT EXISTS idx_bi_hub_reports_bicc_department_id
     ON bi_hub_reports (bicc_department_id) WHERE deleted_at IS NULL;
   ```

---

## 8. Out of Scope (Explicit)

- ❌ FK column index migrations (user tự handle).
- ❌ Audit-log expansion (đã ship Phase 5 trước, không touch lại).
- ❌ Benchmark suite (k6/autocannon).
- ❌ Cache prewarm on role assignment.
- ❌ Admin matrix UI listing "user X has access to records Y" (deleted with `getOwnerScopedIds` — admin UI cần migrate riêng nếu còn dùng).
- ❌ Owner config cho `bi_payment_*` tables.
- ❌ PostgreSQL Row-Level Security adoption.

---

## 9. Unresolved Questions

- **Admin matrix UI:** Nếu admin UI hiện consume `getOwnerScopedIds`, xoá nó sẽ vỡ tính năng. Scout không thấy consumer ngoài interceptor + tests, nhưng cần verify trên Frontend repo (ngoài work context). **User cần confirm trước impl.**
- **`@RequireOwnerScope` write path:** Decorator dùng `isInOwnedScope` cho per-target check — không touched. Nhưng nếu service write path còn dùng `accessibleDataIds` để filter (vd `deleteMany` filter ids), cần đảm bảo logic vẫn đúng khi thay sang `applyDataScope` trên subquery.

---
