---
phase: 5
title: "Coworker APIs clone prompt"
status: completed
priority: P1
effort: "1.5d"
dependencies: [4]
---

# Phase 5: Coworker APIs clone prompt

## Overview

TDD clone `prompt-library` query/upload/perm specs, đổi artifact: `channel_ids[]`, `model_id`, `link` (origin const), `code` chỉ create. Quyền dùng helper phase 1–3. Không usage_guide/tags/category.

## Requirements

- Functional: đủ route như prompt (list/detail/versions/reviews/diff/my-permissions/create/bump/edit/approve/reject/toggle). Download markdown **không** bắt buộc (không có prompt_content) — **skip download** trừ khi copy skeleton trả JSON; chốt: **không** GET download.
- Non-functional: ValidationPipe forbidNonWhitelisted. 1 pending. Avatar `assertStrapiUrl` như prompt.

## Architecture

Controller `@Controller('v1/ai-hub/coworker')` copy prompt, đổi perm codes.

Create DTO: `code`, `name`, `short_description`, `publisher_id`, `responsible_user_ids`, `owning_unit_name?`, `kind`, `avatar_url?`, `channel_ids` (min 1), `model_id`, `link`, `supporter_ids?`.

Bump/edit DTO: **không** `code`. Còn lại giống create (changelog required trên bump).

Link: `new URL(link)`, `origin` ∈ `ALLOWED_COWORKER_LINK_ORIGINS` (`https://teams.microsoft.com`). Trailing slash: so origin only.

`code` create: trim, non-empty, max 100; 23505 → 409.

Replace channels trên version; `replaceSupporters` package; PIC `coworker` workspace — extend `RESPONSIBLE_ENTITY` map (entity phase 4).

Pending edit: SO only; no locked fields (hoặc lock `code` vì không có trên DTO).

## Related Code Files

- Create: `src/modules/coworker/coworker.controller.ts` query/upload services dto `__tests__/*perm* *upload* *query* *upload-meta*`
- Create: `src/modules/coworker/coworker-link.util.ts` + spec origin
- Modify: `AssetHubWorkspace` + PIC entity map + meta read filters
- Modify: `asset-hub-catalog.controller.ts` listUsers thêm coworker_upload/approve (phase 6 cũng được — làm ở đây nếu picker cần lúc create)
- Clone: numbering `old_version` / approve increment như prompt

## Implementation Steps

### TDD red

1. `coworker-link.util.spec.ts`: Teams origin OK; `https://evil.com` throw; relative URL throw.
2. `coworker-perm.spec.ts`: map RequirePermission giống prompt (đổi code).
3. Upload spec: create unique code; bump 403 stranger; bump 200 supporter+upload; pending 403 approver; pending 200 SO mock; omit code trên bump DTO validate.
4. Query spec: list active Bearer; isUpdate canBump; reviews approve-only.

### Green

1. Util + DTOs + services + controller.
2. Wire PIC coworker + channels replace.
3. Module providers.

## Success Criteria

- [x] Perm spec 1-1 prompt (trừ download).
- [x] Link/domain + unique code specs green.
- [x] Quyền khớp helper (không nhánh `canApprove && !owner` bump).
- [x] Không GET download.

## Risk Assessment

Clone prompt quá máy móc kéo `usage_guide` — DTO coworker **không** extend `AssetHubItemMetaFieldsDto` nguyên bản (có guide/tags). Slim DTO riêng: publisher + authors + owning_unit + kind + supporter_ids.
