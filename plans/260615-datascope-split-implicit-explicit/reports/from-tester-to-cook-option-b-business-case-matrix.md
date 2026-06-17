# QA Verification — Option B Business Case Matrix

**Date:** 2026-06-17
**Scope:** `DataAccessInterceptor` Option B + `findOne`/`details` 403-vs-404 split.
**Test suites run:** `src/common/authorization` + `src/modules/data-access` → **241/245 pass**. 4 pre-existing failures in `creator-access-grant.service.spec.ts` (unrelated, verified by `git stash` + retest on `main`).

## TL;DR

Option B is **business-correct** for every primary case. One pre-existing concern flagged (EC7) — endpoints with `@RequirePermission` only (no `@RequireDataAccess`) bypass record scope entirely; this is **not introduced** by Option B but worth a follow-up audit.

---

## Business Rules Under Verification

| ID | Rule |
|----|------|
| BR1 | super_admin can do anything (limited by their data scope). |
| BR2 | User with verb via `role.permissions` (explicit path) sees `explicit ∪ owned`. |
| BR3 | User with verb only via `owner_role.verbs` (owner path) sees **owned only** — even if admin-allow or other-role grants exist. |
| BR4 | User without verb → 403 at `PermissionGuard`. |
| BR5 | For SINGLE-record endpoints: 404 = absent, 403 = exists but out of scope. |
| BR6 | For LIST endpoints: scope silently filters. |
| BR7 | For WRITE-SINGLE with `@RequireOwnerScope`: owner-path user must own the target. |
| BR8 | DENY on a record is bypassed by owner branch (pre-existing design). |

---

## Matrix — User × Record × Operation

Legend: `S` = single (findOne/details/update/delete), `L` = list/multi.

### Case A — super_admin
PermissionGuard sets `verbFromExplicit=true` (line 29). Interceptor fetches both branches. OwnerScopeGuard bypasses on `verbFromExplicit=true` (line 45).

| Record location | S (read) | S (write) | L |
|---|---|---|---|
| In owned subtree | 200 | 200 | included |
| Explicit grant only | 200 | 200 | included |
| Neither | 403 | 403 | excluded |
| DENY rule | depends on owner | depends on owner | depends on owner |

**Verdict:** ✓ BR1. (Note: super_admin filtered by their own data scope — pre-existing. They typically have wildcard explicit grants.)

---

### Case B — role.permissions ∋ verb (explicit-only path)
PermissionGuard sets `verbFromExplicit=true`. Interceptor fetches both branches. OwnerScopeGuard bypasses.

| Record location | S (read) | S (write) | L |
|---|---|---|---|
| In owned subtree | 200 (owner branch) | 200 | included |
| Explicit grant only | 200 (explicit branch) | 200 | included |
| Both | 200 | 200 | included |
| Neither | 403 (assertReportInScope) | 403 | excluded |
| DENY (not owned) | 403 (denied removed from explicit) | 403 | excluded |
| DENY (owned) | 200 (owner branch overrides) | 200 | included |

**Verdict:** ✓ BR2, BR5, BR6, BR8. Integration test `B. role.permissions ∋ verb → verbFromExplicit=true` covers explicit path.

---

### Case C — owner_role.verbs only (owner-only path)
PermissionGuard probe: `hasPermission` returns false → falls through to `getUserImpliedVerbs` → `resolvedViaImplied=true` → sets `verbFromExplicit=false`. **Interceptor (Option B) skips `getAccessibleRecords` entirely — `explicit=[]`**.

| Record location | S (read) | S (write) | L |
|---|---|---|---|
| In owned subtree | 200 (owner branch only) | OwnerScopeGuard ✓ → 200 | included |
| Explicit grant only (cross-scope) | **403** (Option B suppresses explicit) | OwnerScopeGuard ✗ → 403 | **excluded** |
| Both (owns + has explicit) | 200 (owner branch matches) | OwnerScopeGuard ✓ → 200 | included |
| Neither | 403 | 403 | excluded |
| DENY (not owned) | 403 | 403 | excluded |
| DENY (owned) | 200 (owner branch overrides) | 200 | included |

**Verdict:** ✓ BR3, BR5, BR6, BR7, BR8. This is the case Option B was designed for. Integration test `C. owner-only implied verb → verbFromExplicit=false, explicit SUPPRESSED` locks in the critical assertion (`getAccessibleRecords` not called).

---

### Case D — Mixed (user has both role + owner role)

#### D-all-explicit: every required verb is in `role.permissions`
PermissionGuard never queries `impliedVerbs` → `verbFromExplicit=true`. Behaves identically to Case B + owned records included on owner branch.

| Record location | Outcome |
|---|---|
| Owned | 200 (owner branch) |
| Explicit (any) | 200 (explicit branch) |
| Both | 200 |
| Neither | 403 |

**Verdict:** ✓ BR2.

#### D'-mixed: ≥1 required verb resolved via implied path
PermissionGuard line 52 sets `resolvedViaImplied=true` for that verb → after loop `verbFromExplicit=false`. **Interceptor collapses to owner-only.** Conservative behavior: any implied-resolved verb downgrades the endpoint to owner-only scope.

| Record location | S (read) | S (write) | L |
|---|---|---|---|
| Owned | 200 | 200 | included |
| Explicit only | **403** (suppressed) | OwnerScopeGuard ✗ → 403 | excluded |
| Neither | 403 | 403 | excluded |

**Verdict:** ✓ BR3. Conservative interpretation: if user couldn't prove ALL verbs explicitly, they ride the owner-only rail. Integration test `D'. multi-verb, ONE verb only in impliedVerbs` covers.

---

### Case E — No verb at all
PermissionGuard throws `ForbiddenException` at line 50. Interceptor never reached.

**Verdict:** ✓ BR4.

---

## Edge Cases (EC)

| ID | Scenario | Outcome | Verdict |
|----|----------|---------|---------|
| EC1 | `@RequireDataAccess` only (no `@RequirePermission`) | `verbFromExplicit=undefined` → ownerOnlyPath=false → full union (legacy behavior preserved). | ✓ Safe default — these are typically internal/admin endpoints. |
| EC2 | `@RequireOwnerScope` only | Guard warns + falls through to ownership check (line 47–52). | ✓ Defensive. |
| EC3 | Multi-verb endpoint, partial implied | Collapses to owner-only — conservative. | ✓ See Case D'. |
| EC4 | `scope.explicit=[] && scope.ownedRoots=null` | `applyDataScope` emits `1=0` → no record matches. | ✓ Correct deny-all. |
| EC5 | tableName not in `HIERARCHY_MAP` | Owner branch dropped; falls back to explicit-only or `1=0`. | ✓ Safe. |
| EC6 | `assertReportInScope` with `scope=null` | Early return — admin bypass for internal callers. | ✓ For internal services calling with `null`; HTTP flow always populates `scope`. |
| EC7 | **`@RequirePermission` only** (no DataAccess) — endpoints like `syncGroupManager`, `change-history/*`, `role/*` | Service receives `scope=null`. Record-level filter is bypassed. **Owner-path user with implied verb V could call these.** | ⚠️ **Pre-existing concern** — NOT introduced by Option B. See "Follow-ups" below. |
| EC8 | `findOne` race: record soft-deleted between existence query and `assertReportInScope` | First query filters by `is_deleted=false` → 404 if deleted before existence check. If deleted after, `assertReportInScope` only checks id+scope (not is_deleted) → may return stale 200. | ✓ Acceptable (tiny window, returns slightly-stale data, no security impact). |

---

## Endpoint-level Verification

### Touched in this change

| Endpoint | Decorator stack | Outcome |
|---|---|---|
| `GET /bi-hub/diagnostic-report/:id` | `@RequirePermission` + `@RequireDataAccess` | findOne split: 404 if absent, 403 via `assertReportInScope` if out of scope. ✓ |
| `GET /v1/bicc-department/details/:id` | `@RequirePermission` + `@RequireDataAccess` | details split: 404/403. New helper `assertDeptInScope`. ✓ |
| `GET /admin/diagnostic/report/download` | `@RequirePermission` + `@RequireDataAccess` | Multi-record download. Option B applied via interceptor → owner-path callers only get owned subtree in Excel. ✓ |

### Already-correct endpoints (Pattern 2)

| Endpoint | Notes |
|---|---|
| `POST /bi-hub/diagnostic-report/view` (`increaseView`) | Calls `assertReportInScope` then `findOne`. ✓ |
| `GET /bi-hub/diagnostic-report/updated-user` | Calls `assertReportInScope(reportId, scope)`. ✓ |
| `GET /bi-hub/diagnostic-report/history` | Calls `assertReportInScope(reportId, scope)`. ✓ |
| `PATCH /admin/diagnostic/report/:id` | `assertReportInScope` + `OwnerScopeGuard`. ✓ |
| `DELETE /admin/diagnostic/report/:id` | `assertReportInScope` + `OwnerScopeGuard`. ✓ |
| `DELETE /admin/diagnostic/report` (multi) | `deleteMany` filters by scope predicate. ✓ |
| `GET /bi-hub/diagnostic-report` (list) | List endpoint. Scope filters silently. ✓ BR6. |
| `GET /v1/bicc-department/search` | List endpoint. ✓ BR6. |

### Existing endpoints with `@RequireOwnerScope` but no `@RequireDataAccess`

| Endpoint | Risk |
|---|---|
| `POST /admin/diagnostic/report` (`create`) | Scope-irrelevant (creating new record). `@RequireOwnerScope` on `biccDepartment` body protects against cross-dept creation. ✓ |
| `PUT /v1/bicc-department/update/:id` | OwnerScopeGuard protects. No record returned. ✓ |
| `DELETE /v1/bicc-department/delete/:id` | OwnerScopeGuard protects. ✓ |

---

## Integration Tests Added

`src/common/authorization/__tests__/permission-then-interceptor-integration.spec.ts` — 6 cases composing PermissionGuard → DataAccessInterceptor end-to-end:

- **A** super_admin → full union
- **B** role-only → full union
- **C** owner-only → `getAccessibleRecords` NOT called, explicit=[]
- **D** multi-verb all explicit → full union
- **D'** multi-verb one implied → explicit suppressed (conservative)
- **Edge** no @RequirePermission → defaults to full union

Plus interceptor unit tests (`data-access-interceptor-with-owner.spec.ts`) +4 cases, and integration `Scenario #6d`. **Total Option B coverage: 11 new tests.**

---

## Follow-ups (Not part of this change)

1. **EC7 — `@RequirePermission` only endpoints.** Audit verbs at these endpoints to ensure none are present in any `owner_role.verbs` set. Affected controllers (from grep):
   - `role.controller.ts` (12 endpoints) — role-management verbs unlikely in owner roles, but verify.
   - `data-access.controller.ts` (9) — same.
   - `change-history.controller.ts` (4) — verb `perm_history_view` — verify not in owner_role.
   - `bi-hub-bicc-department-helper.controller.ts` (2)
   - `report-access-records.controller.ts` (1)
   - `diagnostic-report-admin syncGroupManager` (`bh_diag_report_edit` — **THIS verb IS in owner-implied set for bi_hub**, so an owner-path user could trigger sync-all without scope. Worth a fix.)

2. **`docs/system-architecture.md` permission section** — document the new policy explicitly (Option B + 403-vs-404 split).

3. **Audit log** — `project_so-owner-implicit-permission-shipped` memory mentions `is_admin` + `via_owner_role_ids` annotation. Confirm those still emit correctly under the new explicit=[] path.

---

## Test Run Summary

```
src/common/authorization        →  21 suites, all pass
src/modules/data-access         →  1 suite fails (creator-access-grant, pre-existing on main)
                                    21/22 suites pass
Tests:                              241 passed, 4 failed (pre-existing), 245 total
Typecheck (`tsc --noEmit`)      →  Exit 0
```

## Unresolved Questions

1. EC7-syncGroupManager: confirm whether owner-path users SHOULD be able to trigger `bh_diag_report_edit` actions that have no record-scope (sync-all). Business intent unclear — needs product decision.
2. Should `applyDataScope` admin-bypass (`scope===null`) ever fire for super_admin going through HTTP? Currently never — they always have dataScope populated. Confirm this is desired (super_admin filtered to their own role's explicit grants).
3. Should `DataScope` type carry the origin flag explicitly for observability (`origin: 'role' | 'owner'`) even though it's not needed by `applyDataScope`? Useful for audit logging.
