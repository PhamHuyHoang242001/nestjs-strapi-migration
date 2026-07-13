# Code Review Report — data-access record_path

Date: 2026-07-09
Reviewer: code-reviewer subagent
Status: DONE_WITH_CONCERNS → all acceptance criteria met; L2 closed.

## Findings → Disposition
| # | Severity | Finding | Disposition |
|---|----------|---------|-------------|
| L1 | Low | N+1 concurrent query fan-out in list (Promise.all groups × walk) | **ACCEPTED** — plan-acknowledged (≤250 queries admin UI). Monitor; batch-per-level fallback documented. |
| L2 | Low | depth-guard test didn't exercise MAX_HOPS (real config roots bound at ≤5) | **CLOSED** — rewrote test as honest "MAX_HOPS backstop — walk always terminates" asserting query count bound. Guard trivially correct by inspection. |
| E1 | — | FK=0 (OWNER_ALL sentinel) → fetchRow finds no parent.id=0 → breaks gracefully | Verified safe. |
| E2 | — | Self-loop/cycle → hops guard caps at 8 | Verified safe. |
| E3 | — | Whitespace-only name → trim() falsy → ID fallback | Verified safe. |

## Acceptance criteria — final walk
1. list: `record_path` root→leaf per group; `module_path`+`record_name` unchanged ✓ (spec asserts `record_path`='ROOT / leaf-42' + buildPath called with table/id)
2. details: `record_path` + `record_info` unchanged ✓
3. NAME_COLUMN_MAP per level; null/missing → `ID:<id>` ✓ (record-path spec)
4. includes root ✓ (2-level + 4-level specs)
5. fallback `ID:<data_id>` on disallowed table / walk error (per-record catch) ✓
6. depth guard ≤8 ✓ (backstop test)

## Verification
- tsc: 0 errors in `src/modules/data-access/` (1 pre-existing `creator-access-grant` is_active error — fails stashed, not mine).
- jest: 8/8 record-path; 17/17 list; 16/16 read; 93/93 across 8 touched data-access specs.
- Pre-existing failures (`creator-access-grant`, `getrecords-owner-all`) confirmed unrelated (fail stashed).
- All 8 `new DataAccessService(...)` spec call sites patched with `mockRecordPath` 6th arg (constructor param added).

## Contracts
- Response additive: `record_path` appended to list groups + details. `module_path`, `record_name`, `record_info`, `rules`, route signatures unchanged.
- No other `new DataAccessService` consumers (only DI + specs). `report-access-records.controller` calls `getRecords()` (untouched).

## Follow-ups (non-blocking)
- L1: monitor list latency in prod; switch to batch-per-level if pool exhaustion.
