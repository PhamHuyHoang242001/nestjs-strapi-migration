# Red-Team Plan Review — BI-Payment Program Permission Rebuild (8-code)

Reviewer role: Security Adversary + Fact Checker. Verdict: **plan has 3 Critical factual/security defects that cause data loss or leak if executed as written.** Every finding cites file:line evidence.

---

## F1 — CRITICAL — Migration targets WRONG table names → cleanup silently no-ops or crashes, leaving orphaned gates

**Location:** phase-01 §Implementation Steps step 3; §Related Code Files ("role_permission/role_data_access/data_access_users references").

**Flaw:** Plan says delete from `role_data_access` and `role_permission`. Actual entities:
- Role↔permission join = `role_permissions` (plural). Evidence: `src/modules/databases/role.entity.ts:19` `export const ROLE_PERMISSION = 'role_permissions';` and `:55` `@Entity('role_permissions')`.
- Role↔data_access join = `data_access_roles` (NOT `role_data_access`). Evidence: `src/modules/databases/data-access.entity.ts:61` `@Entity('data_access_roles')`.
- `data_access_users` is correct. Evidence: `data-access.entity.ts:37`.

**Failure scenario:** Migration `DELETE FROM role_data_access ...` throws `relation "role_data_access" does not exist` → migration aborts mid-transaction. If author "fixes" by guessing, they may delete nothing (wrong name) → permission rows 43-48 deleted but `role_permissions` rows still point at them (FK/orphan) → PermissionGuard queries `JOIN permission p ON p.id = rp.permission_id WHERE p.code = :permCode` (`src/common/authorization/services/permission-query.service.ts:218,286`) silently return empty for the removed codes, but stale `role_permissions` rows linger and any re-seed reusing an id resurrects a live gate on unexpected roles.

**Fix:** Correct names to `role_permissions`, `data_access_roles`, `data_access_users`, `permissions`. Verify against entities before writing DELETE. Add FK/orphan assertion (count before/after) per phase-01 §Risk mitigation.

---

## F2 — CRITICAL — Deleting permission ids 43-48 orphans `data_access` parent rows AND leaves role grants that are NOT permission-scoped in the junction

**Location:** phase-01 §Non-functional ("xóa row cũ (43–48) + reference ... tránh gate mồ côi"); phase-06 §Risk (reset assignment).

**Flaw:** A `data_access` row is created per `(data_id, module_id)` and shared across permissions — it carries NO permission_id. Evidence: `data-access.entity.ts:9-19` (columns `data_id`, `module_id`, no permission_id); creation `src/modules/data-access/data-access.service.ts:57-73` — `data_access_roles` rows are inserted with only `{role_id, data_access_id}` (line 63), permission_id lives ONLY on `data_access_users` (line 67-70). The plan's cleanup deletes permission rows + `data_access_users`, but:
1. `data_access_roles` grants at module_id=13 survive (they have no permission_id to filter on) — a ROLE that had step access still has its `data_access` rule row.
2. The parent `data_access` rows become orphaned if 43-48 were the only permissions using them.

**Failure scenario:** "Reset assignment → admin gán tay" (plan Decisions) assumes deleting perms wipes grants. But role-based data_access is code-scoped only at *query time* via the `role_permissions` JOIN (`permission-query.service.ts:286-292`). After cleanup, if admin re-grants NEW codes (49/52/53/54) to the same role at the same program, the surviving `data_access` + `data_access_roles` rows are reused/matched → the role may regain broader access than intended, or a leftover orphan `data_access` row for a program silently satisfies a new code the admin didn't mean to scope there. Net: reset is incomplete → privilege leakage window.

**Fix:** Cleanup MUST also delete `data_access_roles` + parent `data_access` rows for module_id=13 (or explicitly document they are retained and re-used). Define "reset" precisely: which of {permissions, role_permissions, data_access, data_access_roles, data_access_users} at module_id=13 are truncated. Add a post-reset assertion: zero live grants reference module_id=13 before admin re-grant.

---

## F3 — CRITICAL — Plan's workstep→code mapping is INVERTED vs actual code (RECON_DATA/RECON_FEEDBACK swapped) → own-filter attached to the wrong workstep → recon leak

**Location:** phase-02 §Implementation Steps step 1 (`RECON_DATA: [...upload_recon]`, `RECON_FEEDBACK: ['bp_program_upload']`); phase-04 own-filter clause `template.workstep_type != 'RECON_DATA' OR d.uploaded_by_id = :userId`.

**Flaw:** Plan assumes RECON_DATA is the sale/recon-uploader step. Actual code maps the OPPOSITE ownership:
- `src/modules/bi-payment/common/step-scope.constants.ts:8` `[RECON_DATA]: 'bp_program_reconciliation_sale'`
- `:9` `[RECON_FEEDBACK]: 'bp_program_reconciliation_bicc'`
- Bonus-view `:22-24` grants `bp_program_reconciliation_bicc` (feedback owner) EXTRA view of `RECON_DATA`.

The plan narrative repeatedly says "bicc → upload full" and "sale → recon_data own-only" but the CODE says bicc owns RECON_FEEDBACK and sale owns RECON_DATA. If the implementer copies the plan's mapping literally into the new `WORKSTEP_TYPE_PERM`, the own-only `upload_recon` gate lands on the wrong step, and the current "who created recon_data" semantics (sale) are silently reassigned.

**Failure scenario:** Implementer trusts plan, wires `upload_recon` own-filter to whatever they *think* RECON_DATA means, but existing docs were uploaded under sale semantics. Post-migration, a recon-uploader (upload_recon) either (a) sees zero of their own historic docs (filter on wrong `uploaded_by_id` join) or (b) the own-clause is skipped for the real recon-data step → every recon-uploader sees every other uploader's recon docs = the exact leak this plan exists to prevent.

**Fix:** Rewrite phase-02/04 mapping from the verified constants. State explicitly which business step (sale vs bicc) becomes `upload` vs `upload_recon`. Do not restate the inverted narrative.

---

## F4 — HIGH — Own-filter coverage gap: `stats`, `upload-status`, `user-created/updated/approved/rejected`, `merge`, cross-program paths read docs but plan does not apply own-filter there

**Location:** phase-04 §Requirements (lists list/findOne/download/upload/stats/upload-status/user-*) but own-filter §Architecture only describes `list` + `assertDocStep`.

**Flaw:** Multiple read paths bypass `resolveWorkstepScopes` own logic:
- `stats` calls `resolveAllowedWorksteps` (Set, no own flag) then aggregates ALL docs of the allowed workstep — `bi-payment-document.service.ts:188-201`. A recon-only user gets counts including OTHER users' recon docs → cardinality leak (how many recon docs exist / their statuses).
- `uploadStatus` gates per-doc via `checkDocStep` (`:228`), which uses `resolveAllowedWorksteps` (no own) `:536-541` → a recon-only user learns s3 status of any recon doc id they enumerate.
- `getAccessibleProgramIds` (`:488-500`) hardcodes the OLD 5 codes (`bp_program_preparing`, `_calculating`, `_reconciliation_bicc`, `_reconciliation_sale`, `_confirm_release`). After rebuild these codes no longer exist → `user-created/updated/approved/rejected` (`:423-436`) + `merge` scope return EMPTY for everyone, OR (if not updated) reference dead codes. Plan phase-04 never lists updating `getAccessibleProgramIds`.
- `distinctUsersByColumn` (`:441-483`) enumerates uploader identities (id+email = PII) across all docs in accessible programs, no own-filter → recon-only user harvests emails of every recon uploader.

**Failure scenario:** `upload_recon` user calls `GET /bi-payment/document/stats?programId=X` and `GET /document/user-created` → obtains count + emails of colleagues' recon submissions despite own-only design. Data exposure of PII + activity metadata.

**Fix:** phase-04 must enumerate EVERY read path and decide own vs full per path. Rewrite `getAccessibleProgramIds` to the 8 new codes. Apply own-clause (or explicit full-view justification) to stats, uploadStatus, distinctUsersByColumn.

---

## F5 — HIGH — Xem-only "empty list" claim unproven for stats/user-* which are gated on `bp_program_view`; a Xem-only user leaks aggregate + identity data

**Location:** phase-04 §Requirements ("`stats`/`upload-status`/`user-*` gate = `bp_program_view` → đổi sang `[upload, upload_recon]`"); phase-05 matrix "Xem → doc list & template list RỖNG".

**Flaw:** Current controller gates `stats`, `upload-status`, `user-created/updated/approved/rejected` on `bp_program_view` — `bi-payment-document.controller.ts:164,173,183,195,207,219`. The plan proposes changing them to upload codes, but the SERVICE for `stats`/`uploadStatus`/`user-*` derives scope from `resolveAllowedWorksteps`/`getAccessibleProgramIds`, NOT from the controller decorator. If only the decorator changes and the service scope keeps returning data for a user who still holds `bp_program_view` via SO-owner or a leftover grant, "empty" is not guaranteed. The plan asserts the outcome ("RỖNG") without tracing that stats returns `{total:0,...}` for a view-only holder — it does NOT, because `resolveAllowedWorksteps` throws Forbidden (500-ish 403) rather than returning empty, an inconsistent contract the plan flags only as "verify hành vi mong muốn" (phase-04 success criteria, unresolved).

**Failure scenario:** Xem-only user hits `/document/stats` → instead of clean empty, gets 403 (leaks "program exists, you lack step") OR, if SO-owner, gets full counts. FE expecting empty list breaks; security expectation ("không rò 1 record") is asserted but not designed.

**Fix:** Decide and DESIGN the Xem-only contract (empty 200 vs 403) uniformly across list/stats/upload-status/user-*; verify service returns empty not throw; add explicit test, not a "verify" TODO.

---

## F6 — HIGH — `update-status` (approve) gate mapping loses the recon-approval path and mis-scopes to PREPARE-only without verifying current dual-code gate

**Location:** phase-04 §Requirements ("`update-status` gate = `bp_program_approve`, chỉ áp PREPARE docs"); plan.md matrix (approve = "duyệt prepare-doc + checklist").

**Flaw:** Current `update-status` is gated on `bp_program_preparing, bp_program_reconciliation_bicc` (TWO codes) — `bi-payment-document.controller.ts:124`. It approves BOTH prepare docs and recon-feedback docs (bicc step). The service `updateStatus` (`:375-417`) sets APPROVAL/REJECTED on any doc where `checkDocStep` passes, across the caller's held steps — NOT restricted to PREPARE. The plan collapses this to `approve` + "chỉ PREPARE docs", silently dropping the ability to approve/reject RECON_FEEDBACK (bicc) docs.

**Failure scenario:** After rebuild, an approver can no longer reject a bad recon-feedback doc (business regression), OR the implementer, seeing docs of other steps, re-adds broad approval → an `approve`-only user approves recon docs the plan intended to exclude. Either way the plan's "chỉ prepare" claim contradicts current behavior (`:391-401` iterates all steps) and is unverified.

**Fix:** phase-04 must state whether recon-feedback approval is retained under `approve` or intentionally removed (business decision — surface to user, do not silently cut). Verify `updateStatus` step restriction against `:391-401` before asserting "chỉ PREPARE".

---

## F7 — MEDIUM — Removed doc `@Delete` still reachable via other verbs; delete gate today is `preparing/reconciliation_bicc/confirm_release`, service.delete shared by no other path — but plan omits merge-log & softRemove side effects

**Location:** phase-04 §Requirements ("Gỡ hẳn `@Delete(':id')` doc + `service.delete` + nhánh delete trong `assertDocStep`").

**Flaw:** `assertDocStep` (`bi-payment-document.service.ts:528-532`) has NO "delete branch" — it is a single generic step assert shared by findOne/download/delete. Evidence: `:284-302` all call the same `assertDocStep`. The plan's instruction to "remove the delete branch in assertDocStep" describes a branch that does not exist → implementer may mistakenly gut the shared assert used by findOne/download, breaking read auth. Also `service.delete` (`:297-302`) does `softRemove`; removing it is fine, but the plan doesn't check callers/tests (`grep delete(` promised in phase-04 step 7 but not pre-verified).

**Failure scenario:** Implementer edits `assertDocStep` looking for a nonexistent delete branch, weakens it, and findOne/download lose their step check → any authenticated holder of any step reads any doc.

**Fix:** Correct phase-04: there is no delete branch in `assertDocStep`; only remove the controller `@Delete` route + `service.delete` method. Leave `assertDocStep` intact.

---

## F8 — MEDIUM — Super-admin bypass + SO-owner path is unchanged, but plan's own-filter design routes recon-only through the SAME `resolveAllowedWorksteps` that grants SO all worksteps — SO-as-recon-uploader edge unhandled

**Location:** phase-02 §Requirements ("SO own-all giữ nguyên"); phase-04 §Risk ("SO owner phải bypass own-filter").

**Flaw:** `resolveAllowedWorksteps` returns ALL worksteps for an SO owner unconditionally — `step-scope.service.ts:36-37`. The new `resolveWorkstepScopes` (plan phase-02) sets SO → every workstep `{own:false}`. But a user can be BOTH an SO owner of program P AND merely `upload_recon` on program Q. The plan treats SO as a global flag; the service resolves it per-program via `isInOwnedScope(userId, table, programId)` (`:36`). If the new resolver checks SO once globally instead of per-program, an SO of one program gains full (own:false) view on programs where they only hold upload_recon → cross-program recon leak.

**Failure scenario:** User is SO of program A, upload_recon on program B. Calls `/document?programId=B` → resolver mis-applies A's SO-owner status → own:false on B → sees other users' recon docs in B.

**Fix:** phase-02 must specify SO resolution stays PER-PROGRAM (`isInOwnedScope(userId, table, programId)` per call), and add a test: SO-of-A + upload_recon-on-B sees only own recon docs in B.

---

## Unresolved questions (for planner)

1. Business call (F6): is recon-feedback (bicc) doc approval intentionally dropped when collapsing `update-status` to `approve`? Current code approves both prepare + recon_feedback (`:391-401`). Needs user confirmation — do not silently cut.
2. Xem-only contract (F5): empty 200 vs 403 across list/stats/user-*? Plan leaves as "verify". Must be decided before phase-04.
3. Reset semantics (F2): exact set of tables truncated at module_id=13. Plan says "reset assignment" but never defines it against `data_access`/`data_access_roles`.
4. F3 blocks everything: which real business step (reconciliation_sale=RECON_DATA vs reconciliation_bicc=RECON_FEEDBACK) becomes `upload` vs `upload_recon`? Plan narrative is inverted vs `step-scope.constants.ts:8-9`.
