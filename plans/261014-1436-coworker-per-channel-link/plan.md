---
title: Coworker per-channel link
description: >-
  Each coworker version channel carries its own link; link validated against the
  channel's DB domain (origin).
status: completed
priority: P2
branch: main
tags:
  - feature
  - backend
  - coworker
  - migration
  - tdd
blockedBy: []
blocks: []
created: '2026-10-14T07:37:09.216Z'
createdBy: 'ck:plan'
source: skill
---

# Coworker per-channel link

## Overview

Today a coworker version has N channels (`coworker_version_channels`) but 1 `coworker_versions.link` hard-validated to Teams. Move `link` onto the join row (1 link per channel per version), add `domain` to `ai_hub_coworker_channels`, validate `new URL(link).origin === channel.domain`, drop `coworker_versions.link`. TDD: lock new contract in specs first.

Source: [brainstorm report](../reports/brainstorm-261014-1436-coworker-per-channel-link.md)

## Locked decisions

| Topic | Decision |
|---|---|
| Storage | `coworker_version_channels.link VARCHAR NULL` (link optional per channel — changed 2026-10-14 on user request); unique live `(coworker_version_id, channel_id)` |
| Old column | Drop `coworker_versions.link` after backfill |
| Domain | `ai_hub_coworker_channels.domain VARCHAR NULL`, one string that may hold a comma-separated origin list (`https://outlook.office.com,https://outlook.live.com`); data filled by user, no seed |
| Match | Split domain on `,` → trim, lowercase, strip trailing `/`, drop empties; link valid if `new URL(link).origin` equals **any** entry (not raw `startsWith` — blocks `teams.microsoft.com.evil.vn`, `@evil.vn`) |
| NULL / empty domain (or only commas) | 400 fail-closed |
| Body | `channels: [{ channel_id, link }]` (min 1, unique channel_id); remove `channel_ids` + `link` |
| Response | `channels: [{ id, name, link }]`; no version-level `link` |
| Diff/comparison | base/incoming = `[{ channel_id, name, link }]` |
| Out of scope | Channel seed/CRUD; skill/prompt/api-catalog |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Tests first (lock contract)](./phase-01-tests-first-lock-contract.md) | Completed |
| 2 | [Migration and entities](./phase-02-migration-and-entities.md) | Completed |
| 3 | [Domain validation and write path](./phase-03-domain-validation-and-write-path.md) | Completed |
| 4 | [Read path (detail/version/diff)](./phase-04-read-path-detail-version-diff.md) | Completed |
| 5 | [Verify and docs](./phase-05-verify-and-docs.md) | Completed |

## Dependencies

- No overlapping unfinished plan (scan 2026-10-14).
- Deploy order: run migration → **fill `domain` for Teams/Outlook/Zalo** → deploy BE + FE together (breaking body/response).
