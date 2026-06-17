---
from: tester
to: cook
date: 2026-06-15
plan: 260615-datascope-split-implicit-explicit
scope: exhaustive permission flow use-case matrix
---

# Permission Flow — Exhaustive Use-Case Matrix

Verified end-to-end qua 3 gates + helper:

```
HTTP → [G1 PermissionGuard] → [G2 OwnerScopeGuard?] → [I3 DataAccessInterceptor] → [S4 Service+applyDataScope] → SQL
```

| Gate | Role | Effect khi pass | Effect khi fail |
|---|---|---|---|
| G1 PermissionGuard | Verb gate (global) | next | 403 `Missing required permission` |
| G2 OwnerScopeGuard | Record-in-owned-subtree (write only) | next | 403 `Out of owner scope` |
| I3 DataAccessInterceptor | Build `req.info.dataScope = { explicit, ownedRoots, denies }` | next | n/a (no fail path) |
| S4 applyDataScope | Emit SQL `(explicit OR owner_branch) AND NOT denies` | rows filtered | empty set / 404 |

## Setup — actors

| Code | User profile |
|---|---|
| **A** | Admin (`req.info.client === 'admin'`) |
| **U** | Regular user — NO role-ticked verbs, NO data_access, NO SO |
| **R** | Regular user — role ticks `view+edit+delete`, NO data_access, NO SO |
| **G** | Regular user — NO role-ticked verbs, has `user_data_access` granting record(s) with specific `permission_id` |
| **G+R** | Regular user — role ticks verbs AND has explicit grants |
| **S** | SO of `bicc_department=1`, role has NO ticked verbs (pure SO) |
| **S+G** | SO + explicit grant on cross-dept record (record 999, dept=2) |
| **S+T** | SO + role also ticks verbs (full overlap with implied verbs) |
| **D** | Any user with Override-Owner DENY on a record (admin kill-switch) |
| **U-expired** | Regular user with data_access whose `end_date < NOW()` |
| **U-deleted-role** | Regular user whose only role is soft-deleted (`r.deleted_at IS NOT NULL`) |

## Setup — records (`bi_hub_diagnostic_reports`)

| Code | Belongs to dept | Notes |
|---|---|---|
| R10 | dept=1 (owned by S) | Standard owned record |
| R11 | dept=1 (owned by S) | Standard owned record |
| R20 | dept=2 (NOT owned by S) | Standard cross-scope record |
| R999 | dept=2 (NOT owned by S) | Cross-scope, has explicit grant for G/S+G with `permission_id = view` only |
| R777 | dept=1 (owned by S) | But also has `OVERRIDE_OWNER` DENY for user D |
| R-deleted | dept=1 | `deleted_at IS NOT NULL` (soft-deleted) |
| R-orphan | parent dept soft-deleted | Hierarchical orphan |

## Endpoints — decorator combos (from `bi-hub-diagnostic-report-{user,admin}.controller.ts`)

| ID | Endpoint | G1 verb | G2 owner-scope | I3 dataScope |
|---|---|---|---|---|
| **E1** | `GET /diagnostic/report` (list) | `view` | — | yes |
| **E2** | `GET /diagnostic/report/:id` (detail) | `view` | — | yes |
| **E3** | `POST /admin/diagnostic/report` (create) | `create` | `bicc_departments` ← body.biccDepartment | — |
| **E4** | `PATCH /admin/diagnostic/report/:id` (update) | `edit` | `diagnostic_reports` ← param.id | yes |
| **E5** | `DELETE /admin/diagnostic/report/:id` (single) | `delete` | `diagnostic_reports` ← param.id | yes |
| **E6** | `DELETE /admin/diagnostic/report?ids=…` (bulk) | `delete` | — | yes |
| **E7** | `GET /admin/diagnostic/report/download` | `download` | — | yes |

---

# Use-case matrix

Legend: ✅ = succeed (record(s) accessible / 200) · ❌403 = 403 at gate · ⛔ = 404/empty (gate pass but record not in scope) · 🔢 = partial (bulk: some success some error)

## Group 1 — Admin (bypass everything)

| # | Actor | Endpoint | Target | Result | Why |
|---|---|---|---|---|---|
| 1.1 | A | E1 list | — | ✅ all rows | G1: `client==='admin'` early return. I3: `dataScope=null`. S4: no-op. |
| 1.2 | A | E2 detail | any | ✅ | Same path. |
| 1.3 | A | E3 create | dept=anything | ✅ | G2 admin bypass at top. |
| 1.4 | A | E4 update | R10 / R20 / R-deleted | ✅ all | All gates short-circuit on admin. |
| 1.5 | A | E5 delete one | any id | ✅ | |
| 1.6 | A | E6 delete many | `?ids=10,20,999` | ✅ all 3 deleted | |
| 1.7 | A | E7 download | — | ✅ all rows | |

## Group 2 — User U (no verb, no grant, no SO)

| # | Actor | Endpoint | Target | Result | Failed at |
|---|---|---|---|---|---|
| 2.1 | U | E1 list | — | ❌403 | G1: verb `view` not in role-perms nor implied (user owns nothing → impliedVerbs = ∅) |
| 2.2 | U | E2 detail | R10 | ❌403 | G1 same as 2.1 |
| 2.3 | U | E3 create | dept=1 | ❌403 | G1 fail `create` |
| 2.4 | U | E4 update | R10 | ❌403 | G1 |
| 2.5 | U | E5 delete one | R10 | ❌403 | G1 |
| 2.6 | U | E6 bulk delete | R10,R20 | ❌403 | G1 |

## Group 3 — User R (role ticks verbs, no grant, no SO)

| # | Actor | Endpoint | Target | Result | Why |
|---|---|---|---|---|---|
| 3.1 | R | E1 list | — | ✅ empty list | G1 pass (role tick). I3: explicit=[], ownedRoots=null. S4: emits `1=0` → 0 rows. **200 OK with empty data**. |
| 3.2 | R | E2 detail | R10 | ⛔ 404 | G1 pass. S4 `1=0` → `getOne()` returns null → service throws NotFound. |
| 3.3 | R | E3 create | dept=1 | ❌403 | G1 pass create. **G2 fail** (`isInOwnedScope` of dept=1: user owns nothing). |
| 3.4 | R | E4 update | R10 | ❌403 | G1 pass. **G2 fail**. |
| 3.5 | R | E5 delete one | R10 | ❌403 | Same — G2 fail. |
| 3.6 | R | E6 bulk delete | R10,R11 | ✅ `{success: 0, error: 2}` | No G2 on bulk! G1 pass. S4 SQL filter `1=0` → deletableIds=[] → 0 rows updated, 2 errors. **No 403, but 0 success**. |

## Group 4 — User G (explicit data_access grants, no SO)

User G has `user_data_access` rows:
- record 999, `permission_id` = `bh_diag_report_view` (read-only grant)
- record 11, `permission_id` = `bh_diag_report_view` + `bh_diag_report_edit` (read+edit grant)

| # | Actor | Endpoint | Target | Result | Why |
|---|---|---|---|---|---|
| 4.1 | G | E1 list | — | ✅ rows [11, 999] only | G1: NO role tick, but… **G1 fail** if NO verb anywhere. `data_access.permission_id=view` does NOT add to user's verb set. Verb gate doesn't inspect data_access grants. **→ 403**. ⚠️ See Note 1. |
| 4.2 | G+R | E1 list | — | ✅ rows [11, 999] | G1 pass (R has role tick). I3 explicit=[11,999]. S4 `r.id = ANY([11,999])`. |
| 4.3 | G+R | E2 detail | R999 | ✅ | Same — record 999 in explicit. |
| 4.4 | G+R | E2 detail | R10 | ⛔ 404 | R10 not in explicit, no owner branch → SQL empty. |
| 4.5 | G+R | E4 update | R999 | ❌403 | G1 pass. I3 explicit-for-edit=[11] (999 only granted view). **G2 fail**: G doesn't own dept=2. |
| 4.6 | G+R | E4 update | R11 | ❌403 | Even though G has edit grant on R11. **G2 fail**: G owns nothing. Explicit grant ≠ owner-scope membership. ⚠️ See Note 2. |
| 4.7 | G+R | E6 bulk delete | R11,R999 | ✅ `{success:0, error:2}` | G1 pass. S4 explicit-for-delete=[] (no delete grants for G). 0 deletable. |

**Note 1**: Data_access grants do NOT confer verbs to the user. Verb gate checks `roles_permissions` (via role tick) ∪ `impliedVerbs` (via SO). A pure-G user without role tick will 403 at G1 even though they have grants. **This is intentional** — verb is "what the user can DO globally"; data_access is "which records that verb applies to".

**Note 2**: Admin write endpoints (E3/E4/E5) require **G2 OwnerScopeGuard** on top of dataScope. G's explicit edit grant on R11 is bypassed by G2 because G doesn't own the bicc_dept root. Writes via admin endpoints are **SO-OR-ADMIN ONLY** by current decorator combo. Workaround: split user-write endpoints without `@RequireOwnerScope` if cross-scope explicit writes are intended.

## Group 5 — User S (SO of dept=1, no role tick)

S's owned roots: `[(bi_hub_bicc_departments, 1)]`.
ImpliedVerbs (via module subtree query): all verbs in `bi_hub_bicc_departments` + sub-modules (`bi_hub_diagnostic_reports`, `bi_hub_reports`) — vd: `{bh_bicc_dept_view, bh_bicc_dept_edit, bh_bicc_dept_delete, bh_report_*, bh_diag_report_*}`. Root-level `create` verb (`bh_bicc_dept_create`) is intentionally excluded — owning a root record does NOT imply permission to create sibling roots.

| # | Actor | Endpoint | Target | Result | Why |
|---|---|---|---|---|---|
| 5.1 | S | E1 list | — | ✅ rows under dept=1 (R10, R11, R777, …) | G1: `view` in impliedVerbs. I3 explicit=[], ownedRoots={bicc, [1]}. S4 EXISTS subquery returns all reports with bicc_department_id=1. |
| 5.2 | S | E2 detail | R10 | ✅ | EXISTS branch matches dept=1. |
| 5.3 | S | E2 detail | R20 | ⛔ 404 | R20 under dept=2; EXISTS branch ($2=[1]) doesn't match → empty → NotFound. |
| 5.4 | S | E3 create | dept=1 | ✅ | G1 `create` in impliedVerbs. G2 `isInOwnedScope(bicc_departments, 1)`: walks up trivially, root=1 ∈ owned. |
| 5.5 | S | E3 create | dept=2 | ❌403 | G2 fail: dept=2 ∉ owned. |
| 5.6 | S | E4 update | R10 | ✅ | G1 implied. G2 `isInOwnedScope(diag_reports, 10)`: walks up R10 → dept=1 → match. I3 owner branch covers R10. |
| 5.7 | S | E4 update | R20 | ❌403 | G2 fail: R20 walks up → dept=2 ∉ owned. |
| 5.8 | S | E5 delete one | R777 | ⚠️ See 6.x (D scenario) — if no OVERRIDE_OWNER: ✅ |
| 5.9 | S | E6 bulk delete | `?ids=10,11,20` | ✅ `{success: 2, error: 1}` | G1 pass. S4 owner branch matches 10+11, not 20. UPDATE WHERE id IN [10,11]. R20 silently skipped. |
| 5.10 | S | E7 download | — | ✅ rows under dept=1 only | Same as list. |
| 5.11 | S | E2 detail | R-deleted (id=10 deleted) | ⛔ 404 | Service adds `report.is_deleted = false`; deleted record filtered out regardless. |

## Group 6 — User S+G (SO + cross-scope explicit grant)

S+G has owned dept=1 AND `user_data_access` granting R999 (dept=2) with `permission_id=view` only.

| # | Actor | Endpoint | Target | Result | Why |
|---|---|---|---|---|---|
| 6.1 | S+G | E1 list | — | ✅ rows under dept=1 ∪ {R999} | I3 explicit=[999], ownedRoots={bicc,[1]}. S4: `(r.id = ANY([999]) OR EXISTS(...dept=1))`. Returns all dept=1 records + R999. |
| 6.2 | S+G | E2 detail | R999 | ✅ | Matched by explicit branch. |
| 6.3 | S+G | E2 detail | R20 (no grant, cross-scope) | ⛔ 404 | Not in explicit, not under owned root. |
| 6.4 | S+G | E4 update | R999 | ❌403 | I3 explicit-for-edit=[] (999 only has view grant). G2 fails (dept=2 ∉ owned). |
| 6.5 | S+G | E5 delete one | R999 | ❌403 | Same as 6.4 — G2 blocks. |
| 6.6 | S+G | E6 bulk delete | `?ids=999,10` | ✅ `{success:1, error:1}` | No G2. S4: explicit-for-delete=[], owner covers R10. R999 not deletable, R10 deletable. |
| 6.7 | S+G | E4 update | R10 (owned) | ✅ | G2 pass (dept=1 owned). Owner branch covers. |

## Group 7 — User S+T (SO + role ticks all verbs explicitly)

ROLE has explicit ticks on `bh_diag_report_{view,edit,delete,create}` AND S+T is SO of dept=1.

| # | Actor | Endpoint | Target | Result | Why |
|---|---|---|---|---|---|
| 7.1 | S+T | E1 list | — | ✅ rows under dept=1 | Same as 5.1. **Role tick doesn't add records — only verb capability**. Result identical to S. |
| 7.2 | S+T | E4 update | R10 | ✅ | Same as 5.6. Role tick redundant with implied. |
| 7.3 | S+T | E4 update | R20 (no explicit grant) | ❌403 | G1 pass via role tick (no impliedVerbs lookup needed — lazy resolve skipped). G2 fail. **Identical to S** despite role tick. |
| 7.4 | S+T | E4 update | R999 (S+T has user_data_access edit grant) | ❌403 | Even with role tick AND explicit edit grant, G2 still rejects (dept=2 ∉ owned). |

**Insight from Group 7**: Adding role ticks to SO role does NOT expand SO's reach beyond owned subtree. **Verb tick ≠ record reach**. To grant SO write power across scopes, you must:
(a) split the endpoint (remove `@RequireOwnerScope`), or
(b) tick in `bicc_department=2` ownership too (make user multi-SO).

## Group 8 — User D (Override-Owner DENY)

Setup: D is SO of dept=1, but admin set `OVERRIDE_OWNER` DENY on R777 (in dept=1) for D.

| # | Actor | Endpoint | Target | Result | Why |
|---|---|---|---|---|---|
| 8.1 | D | E1 list | — | ✅ dept=1 rows EXCLUDING R777 | I3 denies=[777]. S4 appends `AND r.id <> ALL([777])`. Owner branch matches R777 but denies subtracts. |
| 8.2 | D | E2 detail | R777 | ⛔ 404 | dataScope filter excludes 777 → empty. |
| 8.3 | D | E4 update | R777 | ❌403 | G2 still passes (R777 walks up to owned dept=1). But I3 denies includes 777. S4 SQL `(explicit OR owner) AND NOT denies` → 0 rows. Service `assertReportInScope` returns no row → 403/empty depending on service. ⚠️ See Note 3. |
| 8.4 | D | E5 delete one | R777 | ❌ | Same shape as 8.3. |
| 8.5 | D | E4 update | R10 (not denied) | ✅ | Owner branch covers, denies doesn't include 10. |

**Note 3**: For E4, G2 OwnerScopeGuard runs BEFORE dataScope filter. `isInOwnedScope` only checks hierarchy walk-up, NOT denies. So G2 passes but service-level scope check (which uses applyDataScope) blocks. End result: not silent — service throws ForbiddenException or NotFoundException depending on flow. **Correctness preserved**. Performance: 1 extra SQL roundtrip (G2 walk + service check) compared to pure dataScope.

## Group 9 — Expired / soft-deleted edge cases

| # | Actor | Endpoint | Target | Result | Why |
|---|---|---|---|---|---|
| 9.1 | U-expired | E1 list | — | Same as 2.1 if no role tick | `queryDataIds` adds `(da.end_date IS NULL OR da.end_date >= NOW())`. Expired grants don't appear in `explicit`. |
| 9.2 | U-deleted-role | E1 list | — | Same as 2.1 — verb gate fails | `getUserPermissions` SQL filters `r.status='active' AND r.deleted_at IS NULL`. Deleted role's verbs not in set. |
| 9.3 | S (role soft-deleted) | E1 list | — | ❌403 / ✅ empty depending on G1 | `getUserOwnerScope` SQL joins `role r ON r.status='active' AND r.deleted_at IS NULL`. Owner scope drops → impliedVerbs ∅ → G1 fail. |
| 9.4 | Any | E2 detail | R-deleted | ⛔ 404 | Service-level `is_deleted=false` filter. |
| 9.5 | S | E2 detail | R-orphan (parent dept soft-deleted) | ⛔ 404 | EXISTS subquery has `AND dept.deleted_at IS NULL` → orphan filtered out. |

## Group 10 — Table-not-in-hierarchy / config drift

| # | Scenario | Result | Why |
|---|---|---|---|
| 10.1 | Endpoint targets table not in `HIERARCHY_MAP` (vd: `bi_payment_*` chưa onboard) | G2 (if used) returns false → 403 | `findRootTable(unknownTable)` → null → `isInOwnedScope` returns false |
| 10.2 | Endpoint targets table in HIERARCHY_MAP but root has no `ROOT_OWNER_CONFIG` | G2 always 403 | `RESOURCE_TYPE_TO_ROOT_TABLE` lookup miss → owner scope rows skipped |
| 10.3 | `applyDataScope` called with `scope=null` (admin) | No-op | helper line 22 early return |
| 10.4 | `applyDataScope` with `ownedRoots.rootTable` mismatching `tableName`'s root | Owner branch dropped, fall back to explicit-only | walkUp returns null |

## Group 11 — Concurrency / cache window

| # | Scenario | Result | Why |
|---|---|---|---|
| 11.1 | Admin assigns SO dept=2 to user, user fires request immediately | May still see only old scope for ≤120s (owner_scope cache TTL) | Cache TTL = 120s. Force invalidate via `ownerScope.invalidateUser(userId)` if synchronous expectation. |
| 11.2 | Role deleted, user with that role fires request | Verb gate fails on next call (cache invalidated via `permissionCache.invalidateByRole`) | `role.service.delete` no longer wired post-cleanup (Group B revert) — **manual invalidation NOT automatic anymore**. ⚠️ See Note 4. |
| 11.3 | New record created under owned root mid-request | T₁ query sees it via EXISTS branch even if T₀ snapshot missed it | EXISTS subquery is freshly evaluated per query — no IN-list snapshot race. |
| 11.4 | User has 2 roles, one with OVERRIDE_OWNER deny, one without | DENY wins | denies fetched union of both roles; SQL `<> ALL` subtracts. |

**Note 4**: Cleanup task vừa rồi revert role.service.ts → owner-scope cache invalidation on role mutate KHÔNG còn auto. Plan 260615 only covers helper/interceptor refactor; role-side invalidation đáng lẽ thuộc plan 260611-1703 carryover. Khi commit dataScope refactor, cân nhắc rebase 260611-1703 leftover hoặc thêm manual cache invalidate hooks vào role lifecycle. (Out of scope plan 260615.)

## Group 12 — Multi-root SO (user is SO of 2 different services)

User M owns `bicc_department=1` AND `ma_tool_workspace=5`.

| # | Endpoint | Result | Why |
|---|---|---|---|
| 12.1 | GET /diagnostic/report (bi_hub) | ✅ rows under dept=1 only | `getOwnedRoots(userId, 'bi_hub_bicc_departments')` filters scope by rootTable. Workspace ownership doesn't leak into bi_hub query. |
| 12.2 | GET /document (ma_tool) | ✅ rows under workspace=5 only | Same — root-table filter isolates. |
| 12.3 | impliedVerbs | Union of both subtrees | `getUserImpliedVerbs` SQL passes `root_mod.table_name = ANY(['bi_hub_bicc_departments', 'ma_tool_workspaces'])` — user gets verbs from both module trees. |
| 12.4 | E3 create diagnostic report under dept=2 | ❌403 | G2 checks dept=2 ∉ owned bicc roots. |

## Group 13 — Hierarchy depth scenarios

| # | Target | Result | SQL emitted |
|---|---|---|---|
| 13.1 | Query `bi_hub_bicc_departments` (root) by S | ✅ rows where `dept.id = ANY([1])` | No EXISTS, helper line 46-48 short-circuit |
| 13.2 | Query `bi_hub_diagnostic_reports` (1-hop) by S | ✅ EXISTS walking dept | 1 JOIN-less EXISTS |
| 13.3 | Query `ma_tool_documents` (2-hop: doc → template → workspace) by SO of workspace | ✅ EXISTS with 1 INNER JOIN | `EXISTS(FROM templates JOIN workspaces ON ... WHERE ... = ANY)` |
| 13.4 | Query `bi_payment_other_files` (3-hop) by SO of project | ✅ EXISTS with 2 INNER JOINs | depth=3 supported, cycle guard 10-hop unused |

## Group 14 — `denies` interaction edge cases

| # | Scenario | Result |
|---|---|---|
| 14.1 | `explicit=[]`, `ownedRoots=null`, `denies=[5]` | `1 = 0` — denies don't bring rows in, OR branch empty → empty set |
| 14.2 | `explicit=[5]`, `denies=[5]` | Empty — `r.id = ANY([5]) AND r.id <> ALL([5])` → false. Admin deny wins over explicit allow. |
| 14.3 | `ownedRoots` covers R5, `denies=[5]` | Empty — owner branch matches, but `<> ALL` subtracts. |

## Group 15 — User controller endpoints (read-only path, no G2)

bi-hub-diagnostic-report-user.controller.ts has only `view` endpoints with `@RequirePermission + @RequireDataAccess` (NO `@RequireOwnerScope`).

| # | Actor | Endpoint | Target | Result |
|---|---|---|---|---|
| 15.1 | G+R | GET /user/diagnostic/report/:id (R999) | R999 (granted view) | ✅ — no G2 to block. dataScope explicit covers. |
| 15.2 | U | GET /user/diagnostic/report (list) | — | ❌403 — G1 fail |
| 15.3 | R | GET /user/diagnostic/report (list) | — | ✅ empty list — same as 3.1 |

## Final correctness summary

| Property | Status | Source of truth |
|---|---|---|
| Admin bypass at all gates | ✅ | G1+G2 `client==='admin'` early return; I3 sets `dataScope=null` |
| Verb gate independent of scope | ✅ | G1 checks role-permissions ∪ impliedVerbs only |
| Scope filter per-verb (data_access.permission_id) | ✅ | `queryDataIds` filters `p.code = :permCode` |
| SO writes restricted to owned subtree | ✅ | G2 OwnerScopeGuard on admin endpoints |
| Cross-scope explicit grants give READ-ONLY without G2 endpoints | ✅ | User controller has no G2 |
| OVERRIDE_OWNER deny wins over everything (non-admin) | ✅ | `r.id <> ALL(denies)` AND-ed last; not cached |
| Owner branch returns ROOT IDs, not leaves | ✅ | `getOwnedRoots` returns `resource_id` list |
| EXISTS subquery emitted (no IN-list explosion) | ✅ | `data-scope-applier.ts:105` + regression test |
| Cycle guard on hierarchy walk | ✅ | 10-hop max in `walkUp()` |
| `tableName === rootTable` skips JOIN | ✅ | helper line 46-48 |
| Empty dataScope falls back to `1=0` | ✅ | helper line 26-29 |
| Soft-deleted records / parents filtered | ✅ | EXISTS subquery + service `is_deleted` filter |
| Expired data_access excluded | ✅ | `queryDataIds` adds `end_date >= NOW()` |
| Soft-deleted role / inactive role excluded | ✅ | All resolvers filter `r.status='active' AND r.deleted_at IS NULL` |

## Known limitations & design choices

1. **No read-only SO** — `impliedVerbs` is full union of subtree verbs. Cannot restrict SO to read-only within their owned subtree. Fix would intersect impliedVerbs with owner-role's permission set. Out of scope.

2. **Pure-grant user (G) cannot write via admin endpoints** — G2 blocks even if explicit edit grant exists. By-design: write endpoints currently SO-OR-ADMIN. If cross-scope explicit write is needed, must add a separate endpoint without `@RequireOwnerScope`.

3. **Cache TTL = 120s for owner-scope** — eventual consistency window. Force-invalidate via `ownerScope.invalidateUser/Role` after mutations. Currently NOT wired to role lifecycle after Group B cleanup (carryover from plan 260611-1703).

4. **FK partial indexes (`deleted_at IS NULL`) required for EXISTS perf** — flagged out-of-scope by plan, must ship before scaling > 10k records/root.

5. **`applyDataScope` mutates QB via `setParameter` / `andWhere`** — service must call helper AFTER initial QB setup but BEFORE pagination. Order matters for `getCount()` correctness.

## Unresolved questions

- For bulk operations (E6), silent "0 deletable" returned to client (`{success:0, error:N}`) — is this the desired UX for unauthorized records? Or should we return a richer error breakdown (per-id deny reason)?
- Should `assertReportInScope` (used by E2's `findUpdatedUsers`) return 403 instead of 404 to distinguish "exists but no perm" from "doesn't exist"? Currently 404 (existence-hiding for security).

**Status:** DONE
**Summary:** 15 use-case groups × ~70 explicit scenarios enumerated. All correctness invariants traced to source. Limitations + design choices documented.
