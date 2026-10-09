# Cook: AI Hub coworker + supporters + per-WS SO

Date: 2026-10-09
Plan: `plans/261009-1424-ai-hub-coworker/` — 6/6 completed

Shipped coworker at `/v1/ai-hub/coworker` (prompt clone, no download/guide/tags/category). User-provided live-unique `code`, Teams `link`, channel/model lookups. 2 codes: `coworker_upload` / `coworker_approve`.

Cross-cut 4 WS: `ai_hub_supporters`; bump = upload ∧ (creator ∨ supporter); pending PUT = SO only; approver cannot bump. SO via child modules + `ROOT_OWNER_CONFIG` sentinel `rootId===0`, not HIERARCHY_MAP.

Migrations must run `2610091500` → `1600` → `1700` before app boot: stats/latest always query coworker tables.

Verify: tsc clean; 47 AI Hub suites / 731 tests; coworker eslint clean after review (added `uidx_coworker_versions_approved_version_no`). Seed `coworker_approver` has approve only.

## Unresolved

- Supporter can bump but `listVersions`/`versionDetail` still submitter|creator|approver (cloned prompt).
- `listVersions` `isUpdate` is upload+newest-rejected, not full canBump.
- Concurrent reject vs approve still unlocked (cloned).
- No commit this cook; user pushes by hand.
