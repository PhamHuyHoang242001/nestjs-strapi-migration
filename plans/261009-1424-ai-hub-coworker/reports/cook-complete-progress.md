# Cook complete — 261009-1424-ai-hub-coworker

Date: 2026-10-09
Status: 6/6 phases implemented. Plan `status: completed`.

## Progress

| Phase | Status |
|---|---|
| 1 Supporters + canBump | completed |
| 2 Tighten 3 WS | completed |
| 3 SO child modules + implied verbs | completed |
| 4 Coworker schema + lookup GET | completed |
| 5 Coworker APIs clone prompt | completed |
| 6 Stats picker seed docs | completed |

## Verification

- `npx tsc --noEmit` clean
- Jest AI Hub: 47 suites / 731 tests pass (prompt/skill/api/asset-hub/coworker/latest/ai-hub)
- ESLint `src/modules/coworker/**` + seed + coworker migration: 0 errors
- Code review: auth/clone match plan; lint+approved unique index addressed after FAIL; remaining warnings are cloned 3-WS gaps (`isUpdate` vs canBump, supporter version-read, reject lock)

## Deploy order

Migrations `2610091500` → `1600` → `1700` **before** app boot. Stats/latest always query coworker tables.

## Unresolved

- Supporter can bump but `listVersions`/`versionDetail` still submitter|creator|approver (cloned prompt).
- `listVersions` `isUpdate` uses upload+newest-rejected, not full canBump.
- Concurrent reject vs approve still unlocked (cloned).
- No commit (user pushes by hand).
