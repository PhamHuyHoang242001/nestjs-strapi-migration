---
title: AI Hub micro-cache 10s
description: >-
  In-memory 10s micro-cache with single-flight for AI Hub catalog lists, latest
  feed and shared stats counts.
status: completed
priority: P2
branch: main
tags:
  - backend
  - performance
  - cache
  - ai-hub
  - tdd
blockedBy: []
blocks: []
created: '2026-10-16T02:57:37.894Z'
createdBy: 'ck:plan'
source: skill
---

# AI Hub micro-cache 10s

## Overview

Bursts of users hitting the same AI Hub read endpoints each cost 6-7 queries. Add an in-process micro-cache (TTL 10s, single-flight, bounded size) for user-independent reads. No invalidation — staleness ≤10s accepted. 1 backend instance.

Source: [brainstorm report](../reports/brainstorm-261016-ai-hub-micro-cache.md)

## Locked decisions

| Topic | Decision |
|---|---|
| Store | In-process `Map`, TTL 10s, max 500 keys (evict oldest-inserted) |
| Stampede | Single-flight: concurrent misses share one in-flight promise; rejected loads are not cached |
| Scope | `GET items` of skill / prompt / api-catalog **only when `status=active`**; `GET /v1/asset-hub/latest`; `GET /v1/asset-hub/stats` shared counts |
| Keys | `{ws}:list:{stableJson(query)}`, `latest:{limit}`, `stats:counts` |
| Stats | Shared counts cached; `my_versions` moved to its own per-user query (1 SQL for 4 workspaces); response shape unchanged |
| Invalidation | None (TTL only) |
| Out of scope | Detail, coworker list, Redis, ETag, permission-cache swap, `KEYS` fix |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Tests first (lock contract)](./phase-01-tests-first-lock-contract.md) | Completed |
| 2 | [Micro-cache service](./phase-02-micro-cache-service.md) | Completed |
| 3 | [Cache catalog lists and latest](./phase-03-cache-catalog-lists-and-latest.md) | Completed |
| 4 | [Split stats counts from my_versions](./phase-04-split-stats-counts-from-my-versions.md) | Completed |
| 5 | [Verify and docs](./phase-05-verify-and-docs.md) | Completed |

## Dependencies

- No overlapping unfinished plan (scan 2026-10-16).
- Constraint: no auto-format (`eslint --fix` / prettier) — diff must stay semantic-only.
