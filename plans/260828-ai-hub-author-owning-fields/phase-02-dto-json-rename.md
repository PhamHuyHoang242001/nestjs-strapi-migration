---
phase: 2
title: DTO JSON rename
status: completed
priority: P1
effort: 3h
dependencies:
  - 1
---

# Phase 2: DTO JSON rename

## Overview

Hard-cut write + list-query DTO. Không alias key cũ.

## Requirements

- `AssetHubItemMetaFieldsDto`: `owning_block_id` (int ≥1), `author_ids` (array như PIC cũ: min 1, max `MAX_RESPONSIBLE_USERS`, unique), `owning_unit_name` optional string max 500.
- List query skill/prompt/api: `publisher_id` → `owning_block_id`.
- Swagger: Tác giả / Khối chủ quản / Trung tâm-phòng ban chủ quản.

## Related Code Files

- Modify: `asset-hub-item-meta-fields.dto.ts`
- Modify: `list-skill-query.dto.ts`, `list-prompt-query.dto.ts`, `list-api-query.dto.ts`
- Modify: comments create-*-package/version.dto.ts

## Implementation Steps

1. Đổi property DTO meta. Trim `owning_unit_name` ở service (phase 3), DTO `@MaxLength(500)` `@IsOptional` `@IsString`.
2. List query `owning_block_id`; `asset-hub-list-filters.ts` bind `query.owning_block_id` → SQL `pkg.publisher_id`.
3. Không `@Expose` alias key cũ.

## Success Criteria

- [ ] class-validator reject `publisher_id` / `responsible_user_ids` trên create DTO (unknown keys ignored by default — document: FE must send new keys; extra keys stripped)
- [ ] New keys required/optional đúng contract
