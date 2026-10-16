---
phase: 4
title: Split stats counts from my_versions
status: completed
priority: P2
effort: 1.5h
dependencies:
  - 2
---

# Phase 4: Split stats counts from my_versions

## Overview
`fetchWorkspaceStats` mixes shared counts with per-user `my_versions` in one SQL. Split: shared counts cached under `stats:counts`; `my_versions` for all 4 workspaces from one per-user query each request.

## Related Code Files
- Modify: `src/modules/latest-artifacts/latest-artifacts.service.ts` (`fetchWorkspaceStats` ~L104, `listStats` ~L169)

## Implementation Steps
1. Remove the `my_versions` subquery and `$1` param from `fetchWorkspaceStats` (signature drops `userId`).
2. New `fetchMyVersions(userId)`: one SQL returning `{skill, prompt, api_catalog, coworker}` via 4 scalar subqueries with the same predicate as before (`(v.submitted_by = $1 OR p.created_by = $1)` + live filters).
3. `listStats(userId)`: `counts = microCache.getOrLoad('stats:counts', TTL, () => Promise.all(4 × fetchWorkspaceStats))`, `mine = fetchMyVersions(userId)` in parallel; merge into the existing row shape (copy rows — never mutate cached objects).
4. Phase-1 stats specs green.

## Success Criteria
- [ ] Response shape/order unchanged; `my_versions` correct per user
- [ ] Per-request DB cost: 1 query (cache hit) instead of 4

## Risk Assessment
- Mutating cached rows when merging → build new objects (`{ ...row, my_versions }`).
