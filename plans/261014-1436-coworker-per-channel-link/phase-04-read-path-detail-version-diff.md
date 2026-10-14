---
phase: 4
title: Read path (detail/version/diff)
status: completed
priority: P2
effort: 2h
dependencies:
  - 3
---

# Phase 4: Read path (detail/version/diff)

## Overview
Expose per-channel links everywhere channels are returned; rewrite comparison + diff from single link to channel/link lists.

## Related Code Files
- Modify: `src/modules/coworker/coworker-query.service.ts`
  - `loadChannelsByVersionIds` (~L63): select `vc.link`, map type `{ id, name, link }`
  - list (~L219), detail (~L281), listVersions (~L420): unchanged call sites, new shape flows through
  - versionDetail comparison (~L490-495): `base`/`incoming` from channels of predecessor / this version
  - getDiff (~L550-566): `base` from active version channels, `incoming` from this version channels

## Implementation Steps
1. Change loader SQL + return type; keep `ORDER BY vc.coworker_version_id, c.id` so lists are stable for diff.
2. comparison: load channels for `[predecessor?.id, version.id]` in one call; `base = predecessor ? toPairs(map.get(predecessor.id)) : null`, `incoming = toPairs(map.get(version.id))`, where `toPairs` → `{ channel_id, name, link }`.
3. getDiff: same, base from `pkg.active_version_id` when it differs from `versionId`; reuse the single loader call (drop the extra `findOne` for content).
4. Responses spreading `...version` no longer carry `link` (column dropped) — confirm no explicit `link` field left.
5. Phase-1 query specs green.

## Success Criteria
- [ ] Detail/version/list return `channels[].link`
- [ ] Diff + comparison return channel/link lists; null base when no predecessor/active
- [ ] `grep -n "\.link" src/modules/coworker` → only channel-pair usages

## Risk Assessment
- FE diff UI expects strings today → contract change called out in phase 5.
