---
phase: 3
title: Persist and read 3 workspaces
status: completed
priority: P1
effort: 4h
dependencies:
  - 2
---

# Phase 3: Persist and read 3 workspaces

## Overview

Upload/query skill, prompt, api-catalog map JSON mới ↔ cột/join cũ. Response đổi tên nested.

## Architecture

Write: `dto.owning_block_id` → `assertPublisher` → `package.publisher_id`. `dto.author_ids` → `assertUsers` + replace PIC.

`owning_unit_name` (<!-- Updated: Validation Session 1 - bump omit keep -->):
- create: omit/`undefined` → null; `""` → null; string trim max 500
- bump: omit → **không update** cột; `""` → null; string → set

GET `/v1/asset-hub/publishers` giữ nguyên.

Read: decorate `authors` (was `responsible_users`), `owning_block` (was `publisher`), `owning_unit_name` từ package.

## Related Code Files

- Modify: `prompt-library-upload.service.ts`, `skill-package-upload.service.ts`, `api-catalog-upload.service.ts`
- Modify: `prompt-library-query.service.ts`, `skill-package-query.service.ts`, `api-catalog-query.service.ts`
- Modify: `asset-hub-item-meta-read.service.ts` nếu helper gắn publisher/PIC
- Modify: seed demo scripts nếu hardcode keys

## Implementation Steps

1. Create/bump: đọc DTO mới; update package `publisher_id` + `owning_unit_name`.
2. Query format row: đổi key response; list/detail/review cùng shape.
3. GET `/v1/asset-hub/publishers` giữ path (catalog khối). Không đổi URL.

## Success Criteria

- [ ] 3 workspace persist/read đúng map
- [ ] Bump version cập nhật `owning_unit_name` + PIC + block
- [ ] Key cũ không còn trên response
