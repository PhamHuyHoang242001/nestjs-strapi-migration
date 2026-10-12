---
title: Coworker skill reuse matrix API
description: >-
  GET matrix: coworker columns × paged skill rows, tick if active skill version
  links that coworker package.
status: completed
priority: P2
effort: 4h
branch: main
tags:
  - feature
  - backend
  - api
blockedBy: []
blocks: []
created: '2026-10-12T10:31:23.847Z'
createdBy: 'ck:plan'
source: skill
---

# Coworker skill reuse matrix API

## Overview

Read-only `GET /v1/ai-hub/coworker/reuse-matrix` for the coworker×skill reuse screen. Columns = every **active, non-deleted** coworker package (id, code, name). Rows = **paged** active non-deleted skills (id, name, publisher). Cell tick = live `skill_version_coworkers` row on that skill's **active version**. No write, no Excel, no prompt/api-catalog.

## Locked decisions

| Topic | Decision |
| --- | --- |
| Relation | Active skill version only (`skill_packages.active_version_id` → `skill_version_coworkers`) |
| Row/col set | `status=active`, not soft-deleted, `active_version_id` live |
| Pagination | Page **skill rows** (`page`/`limit`, default 20, max 100). Columns **full**. |
| Auth | `BearerGuard` + `PermissionGuard` + `coworker_upload` (SO via implied verbs) |
| Skill `code` | **Omit** — rows are `{id, name, publisher}` |
| Coworker name | `COALESCE(active_version.name, code)` — same as `CoworkerRef` |
| Skill name | Active version `name` |
| Publisher | Skill package `publisher_id` → `{id, name}` via existing batch loader |

## Response shape

```json
{
  "columns": [{ "id": 1, "code": "cw-a", "name": "Coworker A" }],
  "rows": [{
    "id": 10,
    "name": "Skill X",
    "publisher": { "id": 3, "name": "Khối CNTT" },
    "cells": [true, false]
  }],
  "meta": { "total": 42, "page": 1, "limit": 20 }
}
```

`cells[i]` aligns to `columns[i]`. Order: columns by `code` ASC, rows by skill active-version `name` ASC.

## NOT in scope

- POST/PATCH tick-untick
- Excel export
- Prompt / api-catalog matrix
- Inactive packages, any-version / approved-only relation
- Skill `code` on the row
- Column pagination, search, publisher/category filters
- Changing `GET /v1/skill/items` or coworker list

## Prerequisite (not this plan)

Uncommitted join tables must land first: `2610121700-create-version-coworker-join-tables` + `2610121800-backfill-version-coworkers-from-tags`. Query reads `skill_version_coworkers` only.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [{Query + endpoint}](./phase-01-query-endpoint.md) | Completed |
| 2 | [{Tests + docs}](./phase-02-tests-docs.md) | Completed |

## Dependencies

- `skill_version_coworkers` + `assertCoworkerPackages` / `getCoworkersByVersionIds` (current working tree)
- Patterns: `CoworkerController` list, `AssetHubItemMetaReadService.getPublishersByIds`, coworker `list` live-row predicates
- No unfinished plan overlap (`261009-1424-ai-hub-coworker` is completed)
