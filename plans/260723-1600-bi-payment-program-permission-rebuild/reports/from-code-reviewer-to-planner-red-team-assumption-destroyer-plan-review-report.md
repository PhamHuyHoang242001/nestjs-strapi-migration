# Red-Team Review — Bi-Payment Program Permission Rebuild (Assumption Destroyer + Scope Auditor)

Reviewer role: hostile. Verified every claim against live code. 9 findings, all with file:line evidence.

Verdict: **plan under-scopes**. Two whole modules (comment, other-file) with 7 endpoints on old codes are absent from every phase file list; two hardcoded old-code arrays in service layer are not enumerated; the "approve only prepare docs" behavior does not exist in code and no phase implements it; the "just keep template create" gate silently breaks because the service-layer `assertWorkstep` re-resolves to the new codes.

---

## F1 — comment + other-file modules gate on old codes; NOT in any phase file list (orphaned gates after seeder delete)
**Severity: Critical**
**Location:** plan Phase 1 §Related Code Files, Phase 3 §Related Code Files (both omit comment/other-file); plan.md matrix (does not mention these modules).
**Flaw:** Phase 1 migration DELETEs permission ids 43–48 (`preparing`, `reconciliation_bicc`, `reconciliation_sale`, etc.). Two controllers still hold `@RequirePermission` on those exact codes and appear in NO phase's modify list:
- `src/modules/bi-payment/comment/bi-payment-comment.controller.ts:30,39` → `bp_program_preparing`, `bp_program_reconciliation_bicc`, `bp_program_reconciliation_sale` (list + create)
- `src/modules/bi-payment/other-file/bi-payment-other-file.controller.ts:31,40,50,68,78` → `bp_program_preparing` (search, user-created, download-multiple, upload, delete)
**Failure scenario:** After deploy, `PermissionCacheService.hasPermission(userId,'bp_program_preparing')` can never be true (code row gone). Guard OR-set collapses → EVERY comment and other-file endpoint returns 403 for all non-super-admin users. Comment/attachment features silently dark. No test catches it because Phase 5 grep list (`__tests__` only, phase-05 §Existing Specs) does not scan these modules.
**Evidence:** grep `bp_program_preparing` repo-wide hits comment.controller:30,39 + other-file.controller:31,40,50,68,78; neither file named in phase-01/03/04 §Related Code Files.
**Fix:** Add comment + other-file controllers (7 endpoints) to Phase 3 mapping. Decide their new gate (likely `bp_program_upload` per plan's "checklist CRUD→upload" default; comment list probably `[upload, upload_recon, approve]`). Also update service comment headers (`bi-payment-other-file.service.ts:14`, `bi-payment-checklist.service.ts:14`).

---

## F2 — hardcoded old-code arrays in service layer not enumerated; user-* endpoints go empty for everyone
**Severity: Critical**
**Location:** plan Phase 4 §Related Code Files (lists document.service but not the constant array); Phase 2 (rewrites step-scope, not these local arrays).
**Flaw:** Two literal arrays of the 5 old codes live in service files and drive cross-program "accessible programs" resolution — neither is in a phase modify step:
- `src/modules/bi-payment/document/bi-payment-document.service.ts:489-495` (`getAccessibleProgramIds`) → feeds `user-created/updated/approved/rejected`
- `src/modules/bi-payment/template/bi-payment-template.service.ts:36-42` (`STEP_CODES`) → feeds template user-* distinct-user endpoints
**Failure scenario:** After ids 43–48 deleted, `permCache.getAccessibleRecords(userId,'bi_payment_programs','bp_program_preparing')` returns `[]` for every user → `getAccessibleProgramIds` returns `[]` → all four document `user-*` endpoints return empty data with total:0 (document.service.ts:450-452 early-return), and template user-* too. Not a 403 — a silent wrong-answer (worse; looks "working"). Phase 4 step 6 only mentions merge uses `getAccessibleProgramIds` but never says to rewrite the code array.
**Evidence:** document.service.ts:489-495 and template.service.ts:36-42 contain the 5 old literals verbatim; grep confirms; absent from phase-04 §Related Code Files line items.
**Fix:** Phase 4 must explicitly rewrite both arrays to the new upload/approve codes and re-derive "accessible program" semantics (which of the 8 codes grant program access). This is a design question the plan skipped, not a find-replace.

---

## F3 — "update-status only approves prepare docs" behavior does not exist; no phase implements it
**Severity: Critical**
**Location:** plan.md matrix row `approve` ("doc update-status (prepare)"); Phase 4 §Requirements "update-status ... chỉ áp PREPARE docs"; Phase 4 Step 5 ("verify chỉ set status PREPARE docs").
**Flaw:** Phase 4 treats "only prepare docs" as a *verify* step, assuming the restriction already exists. It does NOT. `updateStatus` (`bi-payment-document.service.ts:375-417`) gates each doc purely on `checkDocStep` (caller holds the doc's workstep) — it approves docs of ANY workstep, not just PREPARE. There is no `workstep IN (PREPARE, EX_PREPARE)` filter anywhere. The current gate even spans RECON_FEEDBACK: controller line 124 = `@RequirePermission('bp_program_preparing','bp_program_reconciliation_bicc')`.
**Failure scenario:** Plan swaps controller gate to `bp_program_approve` and calls it done. An approver can still set RECON_DATA / RECON_FEEDBACK docs to approval/rejected because `checkDocStep` at line 392/400 only checks workstep-membership, and `resolveWorkstepScopes` for `approve` (Phase 2 design) grants PREPARE+EX_PREPARE — so `checkDocStep` returns false for recon and it *happens* to skip... but only if Phase 2's approve-scope excludes recon. That coupling is unstated and fragile: if approve is later widened, recon approval silently opens. The "prepare only" invariant is enforced by accident, not by code.
**Evidence:** bi-payment-document.service.ts:375-417 has no workstep-type whitelist; line 391-400 gate is `checkDocStep` only.
**Fix:** Phase 4 must ADD an explicit `if (workstep !== PREPARE && workstep !== EX_PREPARE) continue;` in `updateStatus`, and a test asserting approve-holder cannot approve a RECON doc even if scope resolution changes. Reclassify Step 5 from "verify" to "implement".

---

## F4 — `submit` status path breaks under uploader≠approver split
**Severity: High**
**Location:** plan.md Defaults #3 (uploader≠approver); Phase 4 §Requirements (update-status → `bp_program_approve` only).
**Flaw:** `updateStatus` handles THREE statuses: `submit`, `approval`, `rejected` (`bi-payment-document.service.ts:377,393-401`). Comment at line 372-373: "SUBMIT: any step-holder may submit." The plan re-gates the ENTIRE `update-status` endpoint to `bp_program_approve` only. An uploader (upload / upload_recon, no approve) can no longer call submit → cannot move their own doc from draft/submit state.
**Failure scenario:** Recon uploader uploads a RECON_DATA doc, then needs to submit it for approval. Post-rebuild they lack `approve`, so the `PATCH update-status` endpoint 403s at the guard. Workflow deadlock: uploader can't submit, approver won't see un-submitted docs. The plan's clean "uploader≠approver" default ignores that submit and approve share one endpoint.
**Evidence:** bi-payment-document.service.ts:377 (`['submit','approval','rejected']`), :393-397 (submit branch, "any step-holder").
**Fix:** Either split submit into a separate endpoint gated by upload, or make `update-status` gate `[upload, upload_recon, approve]` and enforce status→code inside the service (submit needs upload; approval/rejected needs approve). Plan must decide; current single-gate design regresses submit.

---

## F5 — template CREATE silently breaks: service `assertWorkstep` re-resolves to new codes despite "gate unchanged"
**Severity: High**
**Location:** plan.md Decisions ("Template lifecycle (create/delete) ngoài scope; chỉ đổi gate view"); Phase 3 §Architecture (template create/delete "giữ nguyên").
**Flaw:** Plan asserts template create/delete are out of scope and gate unchanged. But template create calls `stepScope.assertWorkstep(userId, dto.programId, dto.workstepType)` (`bi-payment-template.service.ts:369`) — which uses `resolveAllowedWorksteps` → `WORKSTEP_TYPE_PERM`/`viewCodesForWorkstep`. Phase 2 rewrites those maps to the NEW upload codes. So after Phase 2, a user holding only `bp_template_create` (controller gate) but not `bp_program_upload`/`upload_recon` FAILS `assertWorkstep` at line 369.
**Failure scenario:** Admin grants "template editor" role = `bp_template_create` only. User passes controller guard, then hits `assertWorkstep` → `resolveAllowedWorksteps` returns empty set → `ForbiddenException('No permission for program')` (step-scope.service.ts:51). Template creation 403s for anyone lacking upload codes. "Gate unchanged" is false — the effective gate silently became create AND upload. Also `duplicate-many` (line 212 `resolveAllowedWorksteps`) same problem.
**Evidence:** template.service.ts:369 `assertWorkstep` in create path; :212 in duplicate path; step-scope.service.ts:34-53 throws on empty.
**Fix:** Phase 3 must explicitly state the post-rebuild coupling: either template create requires upload too (document it as intended), or decouple `assertWorkstep` from the view-code map. Cannot claim "out of scope."

---

## F6 — "Xem is base gate → empty doc list" contradicts Phase 4 dropping Xem from the doc-list decorator
**Severity: High**
**Location:** plan.md Overview + matrix (`bp_program_view` = "base gate; doc/template list rỗng nếu không kèm upload"); Phase 4 §Requirements (list gate → `[upload, upload_recon]`).
**Flaw:** The matrix narrative says Xem-only users reach the list and get an EMPTY result. But Phase 4 sets the doc-list gate to `[upload, upload_recon]` (Xem removed). PermissionGuard is OR-only (`permission.guard.ts:39-47`). A Xem-only user holds neither upload code → 403 at the guard, never reaching the service. Moreover the service `list` throws `ForbiddenException` on empty allowed-set (`step-scope.service.ts:51` via document.service.ts:67), so "empty list" is impossible by two independent mechanisms.
**Failure scenario:** FE built against "Xem shows empty doc grid" gets 403s instead, breaking the documents tab for view-only roles. Test Phase 5 matrix row "Xem → doc list RỖNG" will fail — the actual behavior is 403, and the plan never reconciles "empty" vs "403" (Phase 4 success criterion line 58 even hedges "rỗng (hoặc 403)"). The base-gate framing is decorative, not enforced.
**Evidence:** permission.guard.ts:39-47 (OR semantics, no base-code concept); step-scope.service.ts:51 (throws on empty); document.service.ts:67 (list resolves via that path).
**Fix:** Pick one contract. If "empty list" is desired, doc-list gate must INCLUDE `bp_program_view` and the service must catch the empty-scope case and return `{data:[],total:0}` instead of throwing. If "403" is desired, drop the base-gate language from the matrix. Right now plan promises both.

---

## F7 — `resolveWorkstepScopes` is not "easy to add": shape change breaks `viewCodesForWorkstep` consumers + global-view path
**Severity: High**
**Location:** Phase 2 §Architecture ("assumes it's easy to add ... derive Set from Map"); Phase 2 Step 1 (change `WORKSTEP_TYPE_PERM` record→list "HOẶC giữ viewCodesForWorkstep").
**Flaw:** `WORKSTEP_TYPE_PERM` is a `Record<workstep,string>` (single code) consumed in 4 distinct ways: `resolveAllowedWorksteps` iterates keys + `viewCodesForWorkstep` (step-scope.service.ts:40-49), `resolveGlobalViewableWorksteps` uses `viewCodesForWorkstep` (:71-73), template `assertWorkstep`, and it is RE-EXPORTED to two services (`document.service.ts` via constants, `template.service.ts:487`). Phase 2 proposes changing it to a list-of-codes map but leaves the `viewCodesForWorkstep` bonus mechanism half-specified ("HOẶC"). `resolveGlobalViewableWorksteps` (used by user-* endpoints, F2) has NO program context and NO own-flag — the new own-only logic cannot apply there, so recon own-filtering silently does not apply to `user-created` distinct-user enumeration.
**Failure scenario:** Change the map shape → `viewCodesForWorkstep` (returns `readonly string[]` from `[WORKSTEP_TYPE_PERM[ws]]`, constants.ts:29-35) either breaks type or double-wraps arrays; `resolveGlobalViewableWorksteps.some(code => perms.has(code))` iterates codes assuming flat strings. A recon-only (upload_recon) user calling `user-created` enumerates distinct uploaders across ALL programs they hold any code at, with NO own-filter → leaks identities of other uploaders' docs the own-filter was supposed to hide.
**Evidence:** constants.ts:6-35 (record shape + viewCodesForWorkstep); step-scope.service.ts:69-74 (global path, no own-flag); template.service.ts:487 re-export.
**Fix:** Phase 2 must enumerate ALL 4 consumers and specify the migration for each, and explicitly decide own-filter behavior for the program-less `resolveGlobalViewableWorksteps` path (F2's user-* endpoints). "derive Set from Map" covers only 1 of 4 callers.

---

## F8 — `download-multiple` (other-file) and doc download lack own-filter; recon cross-user leak via secondary endpoints
**Severity: High**
**Location:** Phase 4 §Architecture (own-filter only at `list` ~line 67/154/188/314 + `assertDocStep`); does not enumerate every read path.
**Flaw:** Own-filter design targets doc `list`, `findOne`, `download` via `assertDocStep`. But `assertDocStep`/`checkDocStep` (document.service.ts:528-541) use `resolveAllowedWorksteps` (the flat Set), NOT the new `resolveWorkstepScopes` with own-flag. Phase 4 Step 4 says update them, but the Set-based derivation (`new Set(map.keys())`) DISCARDS the own flag — so `checkDocStep` returns true for ANY RECON_DATA doc in scope, including other users'. Detail/download of another user's recon doc passes.
**Failure scenario:** Recon uploader A knows/guesses doc id of uploader B's RECON_DATA doc, calls `GET /document/:id` or `/:id/download`. `assertDocStep` → `checkDocStep` → `resolveAllowedWorksteps` (Set, no own) → RECON_DATA ∈ set → returns true → 200. List hid it, but detail/download leak it. Security-critical bypass. Plan's Phase 5 security case only tests list/detail/download "KHÔNG thấy" at a high level but the design wires own-flag only into list SQL, not into the single-doc assert.
**Evidence:** document.service.ts:536-541 `checkDocStep` uses `resolveAllowedWorksteps` (flat) with `allowed.has(workstep_type)`, no owner comparison; Phase 4 own-clause (phase-04 §Architecture step 3) is list-only SQL.
**Fix:** `checkDocStep`/`assertDocStep` must call `resolveWorkstepScopes`, and when the matched workstep has `own:true`, additionally require `doc.uploaded_by_id === userId` (unless SO owner). Add explicit cross-user detail+download deny tests, not just list.

---

## F9 — checklist `create`/`update` set uploaded_by via userId, but "CRUD→upload" default ignores approval-path coupling + submit/approve overlap
**Severity: Medium**
**Location:** plan.md Defaults #1 (checklist CRUD→upload); Phase 3 §checklist mapping (list/create/update/delete→upload, approval→approve).
**Flaw:** All 5 checklist endpoints currently gate `bp_program_preparing` (`bi-payment-checklist.controller.ts:29,38,48,58,67`). Plan splits them 4-to-upload + 1-to-approve. But service header says "Checklist thuộc màn preparing" (checklist.service.ts:14) and other-file is a checklist subtree ("Subtree checklist→program→project", other-file.controller.ts:19) also on preparing. If checklist CRUD moves to `upload` (full) but other-file stays unmapped (F1) or moves independently, the checklist→other-file parent/child gate becomes inconsistent: a user can create a checklist (upload) but not attach files to it (other-file gate mismatched).
**Failure scenario:** Upload-full user creates checklist item, then POST other-file for that checklist → 403 (if other-file not re-gated to upload). Broken flow, discovered only in manual QA. Also `approval` → `bp_program_approve`: verify the checklist approval service doesn't itself require the old preparing code internally.
**Evidence:** checklist.controller.ts:29-68 (5× preparing); other-file.controller.ts:19 comment (subtree of checklist), :31-79 (5× preparing); checklist.service.ts:14 header.
**Fix:** Re-gate other-file in lockstep with checklist (both to `upload`), and add a test that create-checklist + attach-other-file succeeds for an upload-only user. Confirm checklist approval service has no internal old-code reference.

---

## Scope Audit Summary — endpoints the plan claims vs. reality

| Module | Endpoints on old codes | In a phase file list? |
|--------|------------------------|-----------------------|
| document.controller | list, detail, download, upload, delete, update-status, merge, get-merged, download-merged (9) + stats/upload-status/user-*(6 on view) | Yes (Phase 4) |
| program-step.controller | 6 (next-step, preparing/calculating/recon/waiting workstep, pic-confirm) | Yes (Phase 3) |
| checklist.controller | 5 | Yes (Phase 3) |
| template.controller | TEMPLATE_VIEW_PERMS (5 codes) | Yes (Phase 3) |
| **comment.controller** | **2 (list, create)** | **NO — F1** |
| **other-file.controller** | **5 (search, user-created, download-multiple, upload, delete)** | **NO — F1** |
| **document.service `getAccessibleProgramIds`** | **5-code array** | **NO — F2** |
| **template.service `STEP_CODES`** | **5-code array** | **NO — F2** |
| bi-payment-template.entity.ts:14-15 | comment only (stale) | NO (harmless doc; note) |

report / history / category: use `bp_program_view` / `bp_project_view` (kept codes) — correctly unaffected. Verified clean.

---

## Unresolved questions (for planner)
1. What is the intended gate for comment list/create and other-file endpoints under the 8-code model? (blocks F1)
2. "Accessible program" semantics for user-* endpoints: which of the 8 codes grant program access? (blocks F2)
3. Submit vs approve: split endpoint or in-service status→code enforcement? (blocks F4)
4. Template create: is upload-code coupling intended, or must create decouple from the view map? (blocks F5)
5. Xem-only doc list: 403 or empty `{data:[]}`? Pick one contract. (blocks F6)
