---
status: completed
---
# Phase 3 — Typecheck + integration verify

## Context
- Plan: `../plan.md`
- Phase 1: `./phase-01-query-service-method.md`
- Phase 2: `./phase-02-cache-wrapper.md`

## Overview
- Priority: P2
- Status: Pending
- Verify no type/lint errors + no existing test regression across authorization module.

## Key insights
- Pure addition (new method + new cache wrapper) — existing contracts unchanged. Regression risk low but must verify via full authorization test suite + tsc.

## Requirements
- `npx tsc --noEmit` clean.
- All `src/common/authorization/__tests__/*.spec.ts` pass.
- No new lint errors in touched files.

## Implementation steps
1. `npx tsc --noEmit` — fix any type errors in new code.
2. Run authorization specs: `npx jest src/common/authorization` — all green.
3. If modularized (new service file): verify module wiring compiles + provider/exports correct.
4. Spot-check: grep for any caller of changed `invalidateByTable` signature — unchanged signature so none expected.

## Todo list
- [ ] tsc --noEmit clean
- [ ] authorization jest suite green
- [ ] (if modularized) module wiring verified
- [ ] code-reviewer subagent pass (mandatory)

## Success criteria
- 0 type errors, 0 test failures in authorization.
- code-reviewer subagent: (a) all acceptance criteria met, (b) no regression, (c) no breaking public contract, (d) follows existing patterns, (e) no lint errors.

## Risk
- None beyond standard.

## Next steps
- Finalize: docs sync + journal.
