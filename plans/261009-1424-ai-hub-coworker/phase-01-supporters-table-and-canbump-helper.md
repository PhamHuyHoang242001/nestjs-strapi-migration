---
phase: 1
title: Supporters table and canBump helper
status: completed
priority: P1
effort: 4h
dependencies: []
---

# Phase 1: Supporters table and canBump helper

## Overview

TDD: bảng `ai_hub_supporters` + helper `canBump` / `replaceSupporters`. Chưa wire 3 WS (phase 2), chưa SO (phase 3).

## Requirements

- Functional: persist nhiều supporter / package; unique live `(type, data_id, user_id)`; max 20; `canBump = hasUpload ∧ (creator ∨ supporter)`.
- Non-functional: soft-delete (`deleted_at` + `is_deleted`); TypeORM entity `BaseSoftDeleteEntity`.

## Architecture

`type`: `skill` | `prompt` | `api-catalog` | `coworker`. `data_id` = package id. Không FK TypeORM (giống PIC).

Helper thuần: nhận `created_by`, `supporterUserIds`, `codes`, `uploadCode` — **chưa** gọi SO.

## Related Code Files

- Create: `src/modules/databases/ai-hub-supporter.entity.ts`
- Create: `src/migration/261009xxxx-create-ai-hub-supporters.ts` (timestamp lúc cook)
- Create: `src/modules/asset-hub-catalog/ai-hub-package-access.helper.ts` + `__tests__/ai-hub-package-access.helper.spec.ts`
- Modify: `src/modules/asset-hub-catalog/asset-hub-item-meta.service.ts` — `replaceSupporters`, `listSupporters`; extend `AssetHubWorkspace` thêm `'coworker'` **chỉ type union** nếu coworker entity chưa có — hoặc generic SQL `ai_hub_supporters` không cần workspace entity map.
- Modify: `src/modules/asset-hub-catalog/__tests__/asset-hub-item-meta.service.spec.ts`
- Create: `src/migration/__tests__/ai-hub-supporters.spec.ts` (SQL strings như taxonomy spec)

## Implementation Steps

### TDD red

1. Spec helper: creator+upload → true; supporter+upload → true; creator không upload → false; lạ+upload → false; empty supporters.
2. Spec `replaceSupporters`: full replace (soft-delete cũ + insert); cap 20 → 400; unique ids; type/data_id.
3. Spec migration: CREATE TABLE + partial unique index `WHERE deleted_at IS NULL`.

### Green

1. Entity + migration: columns `data_id int`, `type varchar(20)`, `user_id int`, timestamps/soft-delete. Index `(type, data_id)` where live.
2. `canBumpPackage({ createdBy, userId, hasUpload, supporterIds })`.
3. `replaceSupporters(manager, type, dataId, userIds)` — assert users qua `assertUsers` sẵn có.
4. `MAX_SUPPORTERS = 20` (có thể alias `MAX_RESPONSIBLE_USERS`).

## Success Criteria

- [x] Helper spec green, không import Nest module WS.
- [x] replaceSupporters spec: replace + cap.
- [x] Migration spec chứa unique partial.
- [x] Chưa đổi `createVersion` 3 WS.

## Risk Assessment

Phase 2 quên gọi helper → quyền cũ còn. Mitigate: phase 2 tests fail nếu approver vẫn bump.
