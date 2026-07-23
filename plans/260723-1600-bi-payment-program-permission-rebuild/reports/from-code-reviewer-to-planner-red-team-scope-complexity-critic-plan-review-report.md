# Red-Team Review — Scope & Complexity Critic + Contract Verifier

Plan: `260723-1600-bi-payment-program-permission-rebuild`
Reviewer role: HOSTILE. Perspective: YAGNI / over- & under-scoping + API/behavior contract consistency.
Verdict: **NOT READY**. Multiple Critical hidden-work gaps + a false-safety-net that the plan's own gating relies on.

---

## F1 — CRITICAL — Plan omits `comment` and `other-file` controllers that reference deleted codes → permanently-dead endpoints

- Location: phase-01 (deletes 43–48), phase-03 §Architecture (enumerates only program-step/program/checklist/template controllers), phase-04 (only document controller).
- Flaw (UNDER-SCOPED): Phase 1 hard-deletes permission ids 43–48 (`preparing/calculating/reconciliation_bicc/reconciliation_sale/confirm_release`). But two functional call-sites the plan never lists still gate on those codes:
  - `bi-payment-comment.controller.ts:30,39` → `@RequirePermission('bp_program_preparing','bp_program_reconciliation_bicc','bp_program_reconciliation_sale')`
  - `bi-payment-other-file.controller.ts:31,40,50,68,78` → `@RequirePermission('bp_program_preparing')` + `@RequireDataAccess(TABLE,'bp_program_preparing')`
- Failure scenario: After ship, no role can hold `bp_program_preparing` (row deleted). Comment list/create and every other-file endpoint gate on a code that can no longer be granted → **all comment + other-file endpoints return 403 for every non-admin, forever.** Silent auth regression, passes CI (string literals, no test covers comment/other-file gate).
- Evidence: `src/modules/bi-payment/comment/bi-payment-comment.controller.ts:30`, `:39`; `src/modules/bi-payment/other-file/bi-payment-other-file.controller.ts:31`, `:41`, `:51`, `:69`, `:79`; deletion at phase-01 line 44.
- Fix: Add comment + other-file controllers to phase 3 re-gating scope (comment→`upload`/`upload_recon`? or `view`? decide; other-file→`upload`). The phase-01 grep (step 1, line 32) already lists these patterns but no phase consumes the inventory — wire the inventory into phases 3/4 explicitly.

## F2 — CRITICAL — `npx tsc --noEmit` is a FALSE safety net; every phase's compile-gate cannot catch stale codes

- Location: phase-01 SC line 52, phase-03 SC line 59, phase-04 SC line 63, phase-04 step 8 ("phải PASS sạch toàn repo (hết reference code cũ)").
- Flaw: The plan repeatedly leans on `tsc --noEmit` to prove old-code references are gone. But `RequirePermission = (...codes: string[])` — codes are **untyped string literals**, not an enum. `tsc` will happily compile `@RequirePermission('bp_program_deleted_code')`. There is no compile relationship between seeder ids and controller strings.
- Failure scenario: Dev completes phase 4, runs `tsc --noEmit`, it passes green → dev concludes "hết reference code cũ" and ships. In reality F1's dead endpoints, plus any missed literal, remain. The plan's stated exit criterion actively produces false confidence.
- Evidence: `src/common/authorization/decorators/require-permission.decorator.ts:4` (`(...codes: string[])`); 84 old-code string-literal occurrences remain in non-test src (grep count).
- Fix: Replace the tsc-gate with an explicit grep-gate: `grep -rn "bp_program_next_step|_preparing|_calculating|_reconciliation_bicc|_reconciliation_sale|_confirm_release" src --include=*.ts` must return 0 non-comment hits. Make THAT the success criterion, not tsc.

## F3 — CRITICAL — phase 3/4 split deliberately leaves document + comment + other-file gating on deleted codes between phases → runtime auth break window (not just compile)

- Location: phase-03 Overview ("Document controller … tách sang phase 4"), phase-03 SC line 59 ("document controller có thể còn reference cũ → sửa ở phase 4").
- Flaw (artificial split): The plan admits document controller still references old codes after phase 3 and hand-waves it as "tsc may fail." But per F2 tsc will NOT fail — it's a *runtime* auth break, not a compile break. Worse: if phase 1's DB migration (delete 43–48) is deployed while phases 3–4 code is mid-rollout, document/comment/other-file endpoints 403 in production. Splitting "delete the codes" (phase 1) from "re-gate all consumers" (phases 3–4) across phases with independent ship-ability is the smell.
- Failure scenario: Partial deploy (migration ran, phase-4 code not yet merged) → document list 403 for all real users. The plan's phase ordering guarantees a broken intermediate state exists.
- Evidence: phase-01 line 44 (DELETE migration); `bi-payment-document.controller.ts:45-104` (list/detail/download/upload still on old 5 codes); phase-03 line 59.
- Fix: Either (a) do all code re-gating (phases 3+4, incl. F1's controllers) BEFORE the delete migration runs, gating the migration behind "all consumers migrated"; or (b) keep old permission rows until every consumer is re-gated and delete in a final phase. Do not delete codes in phase 1.

## F4 — HIGH — Phase 4 claims to "preserve applyDataScope (per-doc DENY)" on the doc list path, but that path HAS no applyDataScope — invented contract

- Location: phase-04 Non-functional line 24 ("giữ `applyDataScope` (per-doc DENY)"), phase-04 Architecture step 2 ("+ applyDataScope(qb,'d',DOC_TABLE,scope)").
- Flaw (CONTRACT INVENTED / BROKEN): The current document `list()` explicitly documents "No per-record data-scope: visibility = step×program" and calls NO `applyDataScope` on the doc query. `applyDataScope` appears in the doc service only at line 507 against `PROGRAM_TABLE` inside `assertProgramInScope`/`getAccessibleProgramIds`, not on the doc list qb. The plan's step 2 tells the implementer to add `applyDataScope(qb,'d',DOC_TABLE,scope)` — but there is no `DOC_TABLE` data_access hierarchy wired, and `scope` isn't even resolved in `list()` (list takes no `DataScope` param; it takes `userId`).
- Failure scenario: Implementer follows step 2 literally → either compile error (no `scope` in scope of `list()`) or, if they plumb a DataScope through, adds a predicate against a table that has no data_access rows → doc list returns empty for everyone. Plan describes a contract that does not exist and instructs breaking the one that does.
- Evidence: `src/modules/bi-payment/document/bi-payment-document.service.ts:52-53` ("No per-record data-scope"), `:54-64` (`list()` signature has no `DataScope`), `:507` (only applyDataScope use, on PROGRAM_TABLE).
- Fix: Drop the applyDataScope claim from phase 4. Own-filter is a plain `uploaded_by_id = :userId` predicate on the doc qb (which the plan also describes at step 3 — the two descriptions contradict). Remove the DENY/DataScope language; the doc list has never had per-doc scope.

## F5 — HIGH — `getAccessibleProgramIds` + template `STEP_CODES` hardcode the old 5 codes; phase 4/3 never updates them → cross-program user-* endpoints silently return nothing

- Location: phase-04 (document own-filter) does not mention `getAccessibleProgramIds`; phase-03 step 4 mentions template.service lines 84/212/404/412 but not `STEP_CODES` (line 37).
- Flaw (UNDER-SCOPED): Two hardcoded arrays of the old codes drive cross-program scoping:
  - `bi-payment-document.service.ts:489-495` `getAccessibleProgramIds` codes = old 5.
  - `bi-payment-template.service.ts:37-43` `STEP_CODES` = old 5.
  After deletion, `getAccessibleRecords(userId, table, 'bp_program_preparing')` returns [] for all → user-created/user-updated endpoints and template cross-program enumeration silently yield empty sets. Not a 403, not a crash — a silent data-disappearance.
- Failure scenario: Approver opens "documents I approved" → empty despite having approved docs, because the underlying program-id resolution keys on deleted codes. No test catches it (plan's matrix tests per-program list, not the cross-program user-* path).
- Evidence: `src/modules/bi-payment/document/bi-payment-document.service.ts:489-495`; `src/modules/bi-payment/template/bi-payment-template.service.ts:37-43`.
- Fix: Add both arrays to phase-3/4 modify list; replace with new codes (`upload`,`upload_recon`,`approve`,`confirm`,`view`). Add a cross-program user-* test to phase 5 matrix.

## F6 — HIGH — New `resolveWorkstepScopes` Map alongside retained `resolveAllowedWorksteps` Set = two sources of truth + dead-code risk; the "backward-compat" Set is not actually needed

- Location: phase-02 Architecture ("Giữ 2 API tương thích"), lines 33-35, SC line 69.
- Flaw (OVER-ENGINEERED / premature dual-API): The plan keeps `resolveAllowedWorksteps` (Set) "cho các chỗ chỉ cần thấy hay không" AND adds `resolveWorkstepScopes` (Map). But grep shows EVERY current consumer of `resolveAllowedWorksteps` is inside code the rebuild already rewrites: doc service list/checkDocStep (67,188,314,539), template service (84,212,404,412). None is a stable external caller that justifies a compatibility shim. Keeping both means own-flag logic lives in the Map while the Set silently drops it — a future caller using the Set path gets no own-filter and leaks recon docs.
- Failure scenario: A later endpoint (or a phase-4 branch) calls the retained `resolveAllowedWorksteps` for a doc list, gets the flattened Set, applies no own-filter → recon_data of other users leaks. The dual API is a foot-gun with no offsetting benefit since all callers are in-scope for rewrite anyway.
- Evidence: `step-scope.service.ts:34` (Set method), all 8 call-sites listed in grep are rewrite targets; phase-02 line 34 keeps Set "derive từ Map".
- Fix: YAGNI — collapse to ONE resolver returning `Map<workstep,{own}>`. Where a caller only needs presence, use `map.has(ws)`. Delete `resolveAllowedWorksteps` rather than deriving a lossy Set. If a Set helper is truly wanted, make it a thin local `new Set(map.keys())` at the one call-site, not a public method.

## F7 — HIGH — `approve` mapped to PREPARE **and** EX_PREPARE with `own:false` widens visibility beyond the current model without stated justification (contract widening)

- Location: phase-02 step 1 map (`PREPARE:[upload,approve]`, `EX_PREPARE:[upload,approve]`), phase-02 SC line 67, plan.md open-Q2 (line 61, "đề xuất áp dụng", i.e. NOT user-confirmed).
- Flaw: Under the current model, RECON_DATA maps to `bp_program_reconciliation_sale` and view-bonus lets bicc see recon_data. The new map gives `approve` full `own:false` view of both PREPARE and EX_PREPARE. This is derived from open-Q2 which the plan itself flags as an unconfirmed default ("Defaults cần user xác nhận"). Shipping an unconfirmed visibility-widening as if decided violates "don't apply unconfirmed defaults silently."
- Failure scenario: Approver role, intended only to approve prepare docs, now also sees all EX_PREPARE docs of all users (own:false) because the plan folded EX_PREPARE into approve's view set on its own initiative. If Q2's real answer is "approve sees only PREPARE," this is an over-grant.
- Evidence: phase-02 lines 47-48; plan.md lines 58-62 (open questions, "đề xuất"); current `WORKSTEP_TYPE_PERM` has no approve concept (`step-scope.constants.ts:6-11`).
- Fix: Do not encode open-Q2/Q3 into the phase-2 map until user confirms. Mark the EX_PREPARE-under-approve row as pending-decision; default to narrowest (PREPARE-only) until confirmed.

## F8 — MEDIUM — Seed of 4 sample roles (phase 6) is gold-plating on an explicitly ops-gated, unconfirmed decision — yet plan lists it as a deliverable

- Location: phase-06 step 2 (4 sample roles), Related Code line 22 ("(tùy chọn, xác nhận với ops)"), plan.md decision line 51 ("admin gán tay lại — KHÔNG auto-map migration").
- Flaw (GOLD-PLATING against own decision): The brainstorm decision is "reset assignment, admin manually re-grants." Seeding 4 opinionated sample roles (Uploader/Recon/Approver/PIC + a 5th Editor at step 2) contradicts "admin gán tay" and is self-marked "tùy chọn, xác nhận với ops" — i.e. not user-requested. Seeding roles also creates new seed rows that the reset/rollback story must now also manage.
- Failure scenario: Roles get seeded, admin also manually grants → duplicate/overlapping role definitions in prod; rollback (phase-06 line 33) only covers permission codes, not seeded roles → orphan sample roles linger after rollback.
- Evidence: phase-06 lines 22, 27-32; plan.md line 51 (reset = manual grant, no auto-map).
- Fix: Cut role seeding from scope (YAGNI). Keep "admin gán tay" per the confirmed decision; if ops wants templates, deliver them as a documented SQL snippet in rollout-checklist, not committed seeder rows.

## F9 — MEDIUM — Superseded-plan handling is contradictory: 260708 is `blockedBy` this rebuild, yet phase 6 cancels it as "superseded"

- Location: plan.md front-matter `blocks: [260708-1550]` (line 9) + Dependencies line 66; phase-06 step 4 (set 260708 `cancelled`). Actual: `plans/260708-1550-.../plan.md:8` `blockedBy: [260723-1600...]`, still `status: pending`.
- Flaw (CONTRACT/DEPENDENCY inconsistency): A plan that is *blocked-by* X is semantically "waiting to run after X," not "replaced by X." The rebuild both (a) declares it blocks 260708 and (b) plans to cancel 260708. If 260708 truly is superseded, it should not be modeled as blocked-by (a dependency edge implying it still runs). This is metadata debt that will confuse the plan tracker: after rebuild ships, an automated "unblock" could flip 260708 to actionable at the same moment phase 6 cancels it — race.
- Evidence: plan.md:9, plan.md:66; `plans/260708-1550-bi-payment-step-scoped-permission/plan.md:4,8`.
- Fix: Decide one relationship. If superseded: change 260708 to `status: cancelled` up-front (or `supersededBy`), remove the blocks/blockedBy edges. Don't model supersession as a blocking dependency.

## F10 — MEDIUM — `waiting-for-approval-workstep` and `pic-confirm-final-link` currently SHARE `bp_program_confirm_release`; splitting them (edit vs confirm) is correct but the shared service handler is not addressed → possible authz/logic mismatch

- Location: phase-03 mapping lines 27-28 (waiting→edit, pic-confirm→confirm), phase-03 Risk line 63 ("waiting-for-approval gọi service.updateCalculating (chia sẻ handler)").
- Flaw (CONTRACT split without handler check): Both endpoints today gate on the same code (`bp_program_confirm_release`, controller lines 74-75, 83-84). The plan splits them: waiting→`edit`, pic-confirm→`confirm`. But phase-03's own risk note admits waiting-for-approval shares a handler (`updateCalculating`). If the shared service handler embeds any assumption tied to the old single code (e.g. a secondary `assertWorkstep`/scope check), splitting the gate at the decorator while the handler still resolves scope via a stale path could allow an `edit`-only user to trigger confirm-side effects, or vice-versa.
- Failure scenario: `edit` user hits waiting-for-approval-workstep (now allowed) which shares logic that also advances/finalizes release state → edit user performs a confirm-class state transition. The plan changes the decorator but never verifies the shared handler's internal scope assertion matches the new split.
- Evidence: `bi-payment-program-step.controller.ts:73-75` (waiting) and `:82-84` (pic-confirm) both on `bp_program_confirm_release`; phase-03 line 63.
- Fix: Phase 3 must inspect the shared handler and confirm the internal scope check keys on workstep, not on the (now-split) code. Add a test: edit-only user cannot cause a confirm-class side effect via waiting-for-approval.

---

## Positive contract checks that PASSED (not findings)

- id 49 IS genuinely free (seeder jumps 48→50); ids 52/53/54 unused. Plan's id assignment is factually valid. Evidence: `permission.seeder.ts:299-305`.
- Enum has exactly 4 worksteps (PREPARE/RECON_DATA/RECON_FEEDBACK/EX_PREPARE); phase-2 map covers all 4. Evidence: `ma-tool.enums.ts:28-33`.
- `uploaded_by_id` is the real creator column (plan phase-04 line 68 correct). Evidence: `bi-payment-document.service.ts:159,273,424`.

## Unresolved questions

1. Should `comment` and `other-file` endpoints (F1) map to `view`, `upload`, or a mix? Not addressed anywhere in plan — blocks F1 fix.
2. Open-Q1/Q2/Q3 (plan.md 60-62) are encoded into phase-2/3 maps as if decided (F7). Are they confirmed? If not, phases 2-3 are built on unconfirmed defaults.
3. Does the reset-assignment deploy delete role_permission rows for the OTHER bi-payment modules (project id 33-38, template 50/51) or only program 43-48? phase-01 line 44 DELETE scope is program-only but "reset assignment" wording is broader.
