---
title: AI Hub author + owning block fields
description: >-
  Hard-cut JSON: author_ids + owning_block_id + owning_unit_name. DB keeps
  publisher_id and *responsible tables. 3 workspaces.
status: completed
priority: P2
branch: main
tags:
  - ai-hub
  - asset-hub
blockedBy: []
blocks: []
created: '2026-08-28T08:01:28.833Z'
createdBy: 'ck:plan'
source: skill
---

# AI Hub author + owning block fields

## Overview

Hard-cut JSON keys cho skill / prompt / api-catalog. FE deploy cùng lúc.

- Write: `author_ids`, `owning_block_id`, optional `owning_unit_name` (max 500)
- Read: `authors`, `owning_block: {id,name}`, `owning_unit_name`
- List filter: `owning_block_id` (map SQL `pkg.publisher_id`). Không filter `owning_unit_name`
- DB: cột `publisher_id` + bảng PIC giữ tên; thêm `owning_unit_name` nullable trên 3 package tables

Brainstorm: [brainstorm-summary.md](./brainstorm-summary.md)

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Migration owning_unit_name](./phase-01-migration-owning-unit-name.md) | Completed |
| 2 | [DTO JSON rename](./phase-02-dto-json-rename.md) | Completed |
| 3 | [Persist and read 3 workspaces](./phase-03-persist-and-read-3-workspaces.md) | Completed |
| 4 | [Tests](./phase-04-tests.md) | Completed |

## Contract

```
# create / bump body
author_ids: number[]          # was responsible_user_ids
owning_block_id: number       # was publisher_id
owning_unit_name?: string     # omit/"" → null; max 500

# list / detail row
authors: { id, email }[]      # was responsible_users
owning_block: { id, name }    # was publisher
owning_unit_name: string|null

# list query
owning_block_id?: number      # was publisher_id; SQL pkg.publisher_id
```

## Out of scope

FE, rename DB `publisher_id`, rename `*_responsible`, filter freetext, alias key cũ.

## Validation Log

### Verification Results

- Claims checked: 8
- Verified: 8 | Failed: 0 | Unverified: 0
- Tier: Standard
- `AssetHubItemMetaFieldsDto` `publisher_id` + `responsible_user_ids`
- Package tables: `skill_packages`, `prompt_packages`, `api_catalog_packages` có `publisher_id`
- Query decorate `publisher` + `responsible_users` (skill-package-query.service.ts)
- List filter `pkg.publisher_id` (`asset-hub-list-filters.ts`)
- Global pipe `whitelist: true`; asset-hub catalog `forbidNonWhitelisted`; upload-meta spec giả định 400 extra keys

### Session 1 (2026-08-28)

- Bump omit `owning_unit_name` = keep; `""` = null
- GET `/v1/asset-hub/publishers` giữ URL

### Whole-Plan Consistency Sweep

- Zero unresolved. Dual names JSON vs DB documented. List query + write + read keys consistent.
