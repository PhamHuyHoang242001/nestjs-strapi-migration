---
date: 2026-07-21
topic: report-access records enrichment
status: completed
---

# Journal — report-access records enrichment

## Context

`GET /v1/report-access/records/:tableName` returned only browser base fields (`id`, `display_name`, `created_at`). The grouped data-access list already exposed `record_path` and configured `record_extra`, so the records endpoint had an inconsistent response contract.

## What happened

- Added one shared enrichment step to unscoped, owner-scoped, and whole-table owner flows.
- `record_path` was implemented, then temporarily disabled for this records endpoint per current rollout decision.
- Tables declared in `EXTRA_FIELDS_MAP` receive optional `record_extra`. Extra values are fetched once for the page with `id = ANY($1)` and mapped back by record ID.
- Missing config means `record_extra` stays absent. Failed extra-field lookup also omits it, preserving records-browser availability.

## Reflection

Root cause was contract drift: both records query branches returned raw rows and never reused the display metadata already available to the grouped list. Centralizing enrichment after each records query keeps scoped and unscoped behavior aligned without changing ownership, filtering, search, or pagination logic.

Review found no correctness or security blocker. Two non-blocking concerns remain:

- Per-row `record_path` hierarchy lookup remains commented to avoid query fan-out during the temporary hold.
- `record_extra` query failures are intentionally swallowed. This protects availability but can hide stale field configuration unless operational logging or monitoring detects it.

## Decisions

- Treat the response change as additive: existing fields, pagination metadata, routes, filters, and access-control behavior remain unchanged.
- Temporarily omit `record_path` from the records-browser response; grouped list/details behavior remains unchanged.
- Keep `record_extra` optional and configuration-driven.
- Prefer one batched extras query per page; retain current per-row path resolution pending performance evidence.

## Verification

- 5 focused Jest suites passed, 62 tests total.
- Coverage includes unscoped, scoped, whole-table owner path omission, configured extras, extras-query fallback, and unchanged grouped-list path behavior.
- `git diff --check` passed.
- Full build still reports 22 pre-existing TypeScript errors outside the changed files; this change did not introduce them.

## Next

- Re-enable the commented records-browser path call only when the temporary hold is lifted.
- Consider warning-level telemetry for suppressed extras lookup failures without changing the API fallback.

## Unresolved Questions

None.
