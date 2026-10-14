---
phase: 2
title: Migration and entities
status: completed
priority: P1
effort: 2h
dependencies:
  - 1
---

# Phase 2: Migration and entities

## Overview
One migration: add `domain` to channels, add + backfill `link` on version-channel rows, unique live pair, drop `coworker_versions.link`. Update entities.

## Requirements
- Fail closed on data that would lose links. Idempotent (`IF NOT EXISTS`/`IF EXISTS`) like existing migrations. `down` restores the old column.

## Related Code Files
- Create: `src/migration/2610141500-coworker-per-channel-link.ts` (domain slug name, 10-digit timestamp like siblings)
- Modify: `src/modules/databases/coworker-version-channel.entity.ts` (+`link`)
- Modify: `src/modules/databases/coworker-channel.entity.ts` (+`domain: string | null`)
- Modify: `src/modules/databases/coworker-version.entity.ts` (−`link`)

## Implementation Steps
1. `ALTER TABLE ai_hub_coworker_channels ADD COLUMN IF NOT EXISTS domain VARCHAR`.
2. `ALTER TABLE coworker_version_channels ADD COLUMN IF NOT EXISTS link VARCHAR`.
3. Preflight (only if `coworker_versions.link` still exists): count live versions with a link but zero live channel rows → if >0 throw (would lose link).
4. Backfill: `UPDATE coworker_version_channels vc SET link = v.link FROM coworker_versions v WHERE v.id = vc.coworker_version_id AND vc.link IS NULL`.
5. Soft-deleted rows with NULL link: same backfill covers them (no live filter) so NOT NULL succeeds; any row still NULL → throw.
6. Preflight duplicates: live `(coworker_version_id, channel_id)` with count>1 → throw. Then `CREATE UNIQUE INDEX IF NOT EXISTS uq_coworker_version_channels_live ON coworker_version_channels (coworker_version_id, channel_id) WHERE deleted_at IS NULL`.
7. `ALTER TABLE coworker_version_channels ALTER COLUMN link SET NOT NULL`.
8. `ALTER TABLE coworker_versions DROP COLUMN IF EXISTS link`.
9. `down`: add `coworker_versions.link VARCHAR`, fill from channel row with smallest id per version, `SET NOT NULL` only if no NULLs, drop index, drop `vc.link`, drop `domain`.
10. Entities updated; `npx tsc --noEmit` clean.

## Success Criteria
- [ ] Up on a DB copy with existing coworker data: every old link present on each of its version's channel rows; `coworker_versions.link` gone
- [ ] Down restores `coworker_versions.link` with the first-channel link
- [ ] Re-running up is a no-op

## Risk Assessment
- Local DB lacks coworker tables (migrations never run locally) → test up/down on a scratch DB built by running the coworker migrations first.
- Down is lossy for multi-link data (keeps first) — documented, acceptable.
