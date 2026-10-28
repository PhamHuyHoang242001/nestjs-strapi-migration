---
phase: 8
title: "Verify review and docs"
status: pending
priority: P2
effort: "4h"
dependencies: [3, 4, 5, 6, 7]
---

# Phase 8: Verify, review and docs

## Steps
1. **Full checks:** `npx tsc --noEmit`; eslint on new files only (no `--fix`); full `npm test`.
2. **End-to-end run** against a scratch DB:
   - migration up + seed script + app boot;
   - exercise every endpoint;
   - confirm responses carry no unrequested columns (security rule);
   - confirm user refs are `{id,email}`.
3. **Code review** by a `code-reviewer` agent against the contract and the security rules.
4. **Docs:**
   - `docs/codebase-summary.md`: a Data Hub API section;
   - Swagger tags `data-hub-*`.

## Success Criteria
- [ ] All green; review has no blocking findings; docs updated
