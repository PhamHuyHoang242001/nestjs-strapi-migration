---
phase: 1
title: Tests first (lock contract)
status: completed
priority: P1
effort: 2h
dependencies: []
---

# Phase 1: Tests first (lock contract)

## Overview
Write/adjust specs for the new contract before touching code. They must FAIL on current code (red), then go green through phases 2-4.

## Requirements
- Cover validation, write path, read path, DTO shape. No mocks that bypass the logic under test.

## Related Code Files
- Modify: `src/modules/coworker/__tests__/coworker-link.util.spec.ts`
- Modify: `src/modules/coworker/__tests__/coworker-upload.service.spec.ts`, `coworker-upload-meta.spec.ts`
- Modify: `src/modules/coworker/__tests__/coworker-query.service.spec.ts`

## Implementation Steps
1. **Link util** (`parseChannelDomains(domain)` + `assertChannelLink(link, domain, channelName)` — new):
   - OK: `https://teams.microsoft.com/l/chat/...` vs domain `https://teams.microsoft.com`.
   - 400: `https://teams.microsoft.com.evil.vn/x`, `https://teams.microsoft.com@evil.vn/x`, `http://teams.microsoft.com/x`, not-a-URL, `zalo://x`.
   - 400: domain `null`/empty → `channel has no domain configured`.
   - Domain stored with trailing slash / different case → normalized (lowercase, strip trailing `/`).
   - Multi-domain: domain `https://outlook.office.com, https://outlook.live.com` → both hosts OK, `https://outlook.office365.com` 400.
   - Separator noise: `' , https://zalo.me ,, '` → parses to `[https://zalo.me]`; `' , , '` → treated as no domain (400).
2. **DTO** (create-package + create-version): `channels` required, min 1; each `{channel_id:int>=1, link:string<=2000}`; duplicate `channel_id` → error; `channel_ids` / `link` at top level → rejected (forbidNonWhitelisted).
3. **Upload service** (createNew / createVersion / editVersion):
   - 3 channels × 3 links → `CoworkerVersionChannel` rows saved with matching `link`; version saved without `link`.
   - Unknown channel → `INVALID_CHANNELS`; channel with NULL domain → 400; link origin ≠ domain → 400 naming the channel.
   - editVersion replaces the channel/link set (old rows removed).
4. **Query service**: `loadChannelsByVersionIds` returns `{id,name,link}`; detail/version/list expose `channels[].link`; comparison + diff return `base`/`incoming` as `[{channel_id,name,link}]` (base null when no predecessor/active).
5. Run `npx jest src/modules/coworker` → expect failures only in the new cases.

## Success Criteria
- [ ] New/updated specs exist for every bullet above
- [ ] Specs fail on current code for the expected reason (not compile noise)

## Risk Assessment
- Over-mocking `manager.query` hides SQL shape bugs → assert SQL fragments / params where the service builds SQL.
