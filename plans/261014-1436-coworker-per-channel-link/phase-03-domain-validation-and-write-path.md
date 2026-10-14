---
phase: 3
title: Domain validation and write path
status: completed
priority: P1
effort: 3h
dependencies:
  - 2
---

# Phase 3: Domain validation and write path

## Overview
Replace hard-coded Teams origin check with per-channel domain check; switch DTOs + 3 write flows to `channels: [{channel_id, link}]`.

## Related Code Files
- Modify: `src/modules/coworker/coworker-link.util.ts`
- Modify: `src/modules/coworker/dto/create-coworker-package.dto.ts`, `create-coworker-version.dto.ts` (+ new nested `CoworkerChannelLinkDto` in the dto folder, exported from `dto/index.ts`)
- Modify: `src/modules/coworker/coworker-upload.service.ts` (`assertLookups`, `replaceVersionChannels`, createNew ~L124/159/165, createVersion ~L199/233/239, editVersion ~L282/336/346)

## Implementation Steps
1. `coworker-link.util.ts`: remove `ALLOWED_COWORKER_LINK_ORIGINS`; add `assertChannelLink(link: string, domain: string | null, channelName: string)`:
   ```ts
   // Domain column may hold several origins: "https://outlook.office.com,https://outlook.live.com".
   export function parseChannelDomains(domain: string | null): string[] {
     return (domain ?? '').split(',').map((d) => d.trim().toLowerCase().replace(/\/+$/, '')).filter(Boolean);
   }
   const allowed = parseChannelDomains(domain);
   if (!allowed.length) throw 400 `INVALID_COWORKER_LINK: channel ${name} has no domain configured`
   let url; try { url = new URL(link) } catch { throw 400 'must be an absolute URL' }
   if (!allowed.includes(url.origin.toLowerCase())) throw 400 `link origin does not match channel ${name}`
   ```
   Origin compare (not `startsWith`) blocks `host.evil.vn` and `user@` tricks. Parsing is done once per channel row (not per request item) when the rows are loaded.
2. DTO: `@ValidateNested({each:true}) @Type(() => CoworkerChannelLinkDto) @ArrayMinSize(1) @ArrayMaxSize(n) readonly channels: CoworkerChannelLinkDto[]`; nested `{ channel_id: int>=1; link: string, notEmpty, maxLength 2000 }`. Unique `channel_id` via `@ArrayUnique((c) => c.channel_id)`. Delete `channel_ids` and `link`.
3. `assertLookups(manager, channels, modelId)`: load `id, name, domain` for the requested ids (live only); missing → `INVALID_CHANNELS`; for each pair call `assertChannelLink`. Return validated `{channel_id, link}[]`. Validation happens inside the existing transaction (before any write).
4. `replaceVersionChannels(manager, versionId, pairs)`: delete prior rows, insert with `link`.
5. Remove `assertCoworkerLink(dto.link)` calls and `link:` assignments on `CoworkerVersion` in all 3 flows.
6. `npx tsc --noEmit`; phase-1 write/util/DTO specs green.

## Success Criteria
- [ ] Phase-1 util, DTO and upload specs pass
- [ ] No reference to `dto.link`, `channel_ids`, `ALLOWED_COWORKER_LINK_ORIGINS` remains (`grep`)

## Risk Assessment
- Channel `domain` empty in prod at deploy → all coworker writes 400. Mitigation: deploy checklist (phase 5) + clear error message naming the channel.

## Security Considerations
- URL parse + origin equality; https enforced implicitly by domain value. Link stored as given (no rewrite).
