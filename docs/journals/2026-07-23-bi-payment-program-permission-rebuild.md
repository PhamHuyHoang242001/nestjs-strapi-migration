---
date: 2026-07-23
topic: bi-payment program permission rebuild
status: completed
---

# BI Payment Program Permission Rebuild

## Context

We rebuilt BI Payment authorization from 10 step-scoped codes into 8 business permissions. The hard part was not the new matrix itself. The hard part was the amount of code that still depended on dead step codes, old route assumptions, and service-layer shortcuts that were invisible until review.

## What Happened

The first pass got the broad shape right, but review exposed the real failure modes: missing comment and other-file gates, hardcoded old-code arrays in service helpers, `update-status` coupling submit and approve, template create still depending on workstep resolution, and a late Prepare-screen regression where checklist list and other-file search still behaved like upload-only routes. We fixed the routing and permission wiring, kept child access scoped through the parent program, preserved the split between full upload and own-only recon access, and aligned the final Prepare read contract with the verified behavior: coarse view/upload entry, raw `[]` for view-only, content only for upload-capable / owner / admin. We also kept the checklist approval path program-scoped, removed the document delete route, and split template lifecycle from permission selection so create/delete stay independent of content-view rules.

## Reflection

This was frustrating because the plan looked clean on paper and still had enough blind spots to break production behavior. The review was useful precisely because it forced the ugly truth out: OR semantics matter, parent scope matters, and “just change the decorator” is not a real authorization change when the service layer still contains old assumptions.

## Decisions

- Keep `PermissionGuard` OR semantics.
- Keep child records scoped through `bi_payment_programs`, not direct child IDs.
- Keep full upload separate from own-only recon access.
- Split submit from approve; approve/reject applies only to prepare-style document flow and checklist approval.
- Remove document delete entirely.
- Preserve route ordering so static routes do not get shadowed by dynamic `:id`.
- Decouple template create/delete from permission matrix rebuild.
- Keep checklist approval program-scoped.
- Preserve the `INPROGRESS` status invariant for document transitions.
- Use an active add migration now, with deferred cleanup later.
- Require manual re-grant; do not auto-map old assignments.
- Treat rollback of permission definitions separately from rollback of role/user assignments.

## Verification

- 20/20 BI Payment and migration suites passed, 174/174 tests.
- Full repo run passed 65/69 suites and 602/604 tests; 4 failures were unrelated.
- `git diff --check` and source lint passed.
- Repo-wide `tsc --noEmit` still had the same 16 unrelated Role property errors outside BI Payment scope.
- Coverage reporter was unusable and returned `All files 0%`.
- No live database migration or smoke test was run here.

## Next

Run the live DB preflight, confirm the physical table names, then do the manual re-grant and smoke pass before any cleanup migration is activated.

## Unresolved Questions

- Which join table exists in the target environment: `role_permissions` or `roles_permissions`.
- When the deferred cleanup migration should be promoted into active scope.
