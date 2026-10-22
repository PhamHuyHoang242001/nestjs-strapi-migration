---
phase: 3
title: "Verify and docs"
status: pending
priority: P2
effort: "1h"
dependencies: [1, 2]
---

<!-- Updated: Validation Session 1 - renumbered from phase 4 (seed phase removed); enum + join probes -->

# Phase 3: Verify and docs

## Implementation Steps
1. Scratch DB (create the real `users` schema or a minimal stub). Run the migration: up, up again (no-op), down, up. Use a temp ts-node runner in `src/scripts-tests/zz-*.ts`, then delete it. Never run `typeorm:run` locally.
2. Constraint probes, each must fail or succeed as designed:
   - duplicate live code
   - soft-deleted duplicate (allowed)
   - bad enum value
   - port 0
   - orphan FK
   - duplicate join pair
   - every TS enum value accepted by its CHECK
3. Drift check: entity metadata columns vs `information_schema.columns` for all `data_hub_%` tables.
4. Run `npx tsc --noEmit`. Lint check only on new files (no `--fix`). `npm test` stays green.
5. Docs: add a short "Data Exchange schema (data_hub_*)" section to `docs/codebase-summary.md` that links the brainstorm report.

## Success Criteria
- [ ] All probes behave as designed; no drift; tsc clean; tests green; docs updated

## Next
- Separate plan: Data Exchange APIs (catalog/detail/create/edit + history diff builder, dictionary, consumers).
