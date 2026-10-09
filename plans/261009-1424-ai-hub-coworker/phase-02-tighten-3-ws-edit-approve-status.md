---
phase: 2
title: Tighten 3 WS edit approve status
status: completed
priority: P1
effort: 1d
dependencies:
  - 1
---

# Phase 2: Tighten 3 WS edit approve status

## Overview

TDD trên spec upload/query/perm **hiện có** của skill, prompt, api-catalog. Siết service: bump/rejected = canBump; pending = **403 mọi role** (SO phase 3); toggle = creator ∨ supporter; `supporter_ids` field trên write DTO.

## Requirements

- Functional: Approver **không** bump, **không** sửa pending. Toggle không còn “chỉ approve”. `supporter_ids` full-replace cùng tx PIC.
- Non-functional: Guard code giữ `*_upload` / `*_approve` (OR trên editVersion + toggle). 403 nằm service.

## Architecture

Hiện: `if (!canApprove && pkg.created_by !== userId)` → bump. `approverPending` → PUT pending.

Mới:

```
createVersion: if !canBump → 403
editVersion rejected: if !canBump → 403; newest only (giữ)
editVersion pending: 403 (phase 2); phase 3: if !isWsSO → 403
toggleStatus(id, dto, userId): creator ∨ supporter (phase 2); ∨ SO (phase 3)
```

`toggleStatus` controller phải truyền `userId` (hiện prompt không truyền).

`isUpdate` query: upload ∧ (creator ∨ supporter) — **bỏ** nhánh approver.

## Related Code Files

- Modify: `prompt-library-upload.service.ts`, `skill-package-upload.service.ts`, `api-catalog-upload.service.ts`
- Modify: 3 controllers `toggleStatus` + `userId`
- Modify: 3 query services `isUpdate` + inactive list (creator/supporter thấy inactive)
- Modify: `asset-hub-item-meta-fields.dto.ts` thêm `supporter_ids` (optional? **required array**, min 0, max 20 — chốt: **optional omit = keep previous** trên bump; **create required?** Brainstorm: field trên create/bump. Create: default `[]` nếu omit. Bump: omit giữ; gửi `[]` xóa hết.
- Modify: 3 `*-upload.service.spec.ts`, `*-upload-meta.spec.ts`, `*-query.service.spec.ts` (isUpdate), approver-pending specs → expect 403
- Modify: `item-meta-read.service.ts` hydrate `supporters`

**Omit vs required:** create `supporter_ids?` default []. bump/edit: omit keep, `[]` clear. Match `owning_unit_name` omit-keep.

## Implementation Steps

### TDD red

1. Upload spec: approver + not owner → `createVersion` 403 (đổi expect hiện tại nếu đang 200).
2. `editVersion` pending + approve code → 403 (gỡ test “approver pending skip locked”).
3. Supporter+upload + not creator → `createVersion` 200.
4. Toggle: owner upload không approve → 200; stranger approve-only → 403.
5. Meta spec: `replaceSupporters` gọi trong create/bump.
6. Query spec: `isUpdate` false cho approver không phải owner/supporter.

### Green

1. Load supporter ids trong canBump (query `ai_hub_supporters`).
2. Gỡ `approverPending` path (hoặc `if (false)` chờ phase 3 SO).
3. Thread userId vào toggle.
4. DTO + persist `supporter_ids`.
5. Read map `supporters` cạnh `authors`.

Chạy 3 bộ spec WS + perm spec (guard **không** đổi trừ toggle thêm upload OR).

## Success Criteria

- [x] Approver không bump / không PUT pending (3 WS).
- [x] Supporter+upload bump được.
- [x] Toggle owner/supporter OK; approver lạ 403.
- [x] `yarn test` các file `prompt-library-*` `skill-package-*` `api-catalog-*` liên quan green.

## Risk Assessment

Khoảng phase 2→3: **không ai sửa pending**. Accept. FE approver-pending sẽ 403 — ship phase 3 cùng release nếu có thể.
