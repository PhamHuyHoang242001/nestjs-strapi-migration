---
phase: 4
title: Tests
status: completed
priority: P1
effort: 3h
dependencies:
  - 3
---

# Phase 4: Tests

## Overview

Sửa spec hiện tại (tên field cũ) + thêm case `owning_unit_name` optional/cap. Yarn test + compile.

## Related Code Files

- Modify: `prompt-library-upload-meta.spec.ts`, `skill-package-upload-meta.spec.ts`, `api-catalog-upload-meta.spec.ts`
- Modify: query specs decorate publisher / responsible_users
- Modify: `asset-hub-list-filters.spec.ts`
- Modify: perm specs không đổi gate

## Implementation Steps

1. Replace fixtures `publisher_id`/`responsible_user_ids` → `owning_block_id`/`author_ids`.
2. Expect `authors` / `owning_block` trên decorate.
3. Persist `owning_unit_name`; omit → null; >500 fail DTO.
4. Filter list `owning_block_id` binds `pkg.publisher_id`.
5. `yarn test` các spec trên + tsc.

## Success Criteria

- [ ] Specs pass
- [ ] Compile sạch
