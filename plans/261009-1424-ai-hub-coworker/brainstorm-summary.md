---
title: AI Hub coworker + supporters + per-WS SO
date: 2026-10-09
status: agreed
---

# Brainstorm: Coworker + siết quyền AI Hub

## Problem

Cần workspace Coworker (flow đầy đủ như prompt) + 3 thay đổi cắt ngang 4 WS (skill, prompt, api-catalog, coworker): supporters chung, SO từng WS, siết edit/approve/status.

## Requirements (chốt)

| Item | Quyết định |
|---|---|
| Flow coworker | Clone prompt: package + version pending/approved/rejected, 1 pending, changelog bump |
| Route | `/v1/ai-hub/coworker` (cùng api-catalog) |
| Codes | Giữ 2/WS: `*_upload` + `*_approve`. Thêm `coworker_upload`, `coworker_approve` |
| Tạo | `*_upload` **hoặc SO** |
| Edit package / rejected newest | `(created_by ∨ supporter) ∧ *_upload` |
| Sửa pending | **chỉ SO**. Approver không sửa pending, không bump hộ |
| Approve/reject | `*_approve` hoặc SO |
| Toggle status | creator ∨ supporter ∨ SO (guard upload OR approve) |
| View active | Bearer, mọi login |
| Tác giả vs supporter | Tách. PIC giữ `*_package_responsibles`. Supporter bảng mới |
| Set supporter | Field trên API create/bump/`editVersion` (full replace, như `author_ids`). **Không** PATCH riêng |
| Coworker fields | mã (unique lúc tạo, immutable, cột package), tên, mô tả ngắn, khối, TT/PB, tác giả, channel[], model 1, link, kind enterprise/personal (nhãn), avatar URL string như prompt |
| Không có trên coworker | usage_guide, tags, category |
| Channel/model | Bảng lookup, seed SQL, GET list, **chưa CRUD** |
| Link domain | Const BE `ALLOWED_COWORKER_LINK_ORIGINS`, tạm `https://teams.microsoft.com` |
| SO | Own-all từng WS giống `ma_tool_cstb_rpt_properties`. Implied upload+approve. Service chặn SO bump người khác; SO được tạo, sửa pending, duyệt, ẩn/hiện |
| Out of scope | 3 code create/edit/approve; CRUD channel/model; đổi mã; gộp author=supporter; data_access rule trên package AI Hub; FE repo |

## Approaches

| | Pros | Cons |
|---|---|---|
| **A. Clone prompt + helper quyền + 4 module con SO** (chọn) | Pattern sẵn; SO không lẫn WS | Migration module/permission ids |
| B. Generic artifact engine | 1 chỗ | YAGNI, rủi ro 3 WS live |
| C. Coworker trước, SO/supporter sau | Ship nhanh coworker | Quyền lệch giữa WS |

## Design (A)

### Coworker schema

- `coworker_packages`: `code` unique (live), `created_by`, `status`, `publisher_id`, `owning_unit_name`, `active_version_id`
- `coworker_package_responsibles`: authors (clone PIC)
- `coworker_versions`: name, short_description, kind, avatar_url, model_id, link, changelog, state, submitted_by, version_no, old_version
- `coworker_version_channels`: M2M version ↔ channel
- `ai_hub_coworker_channels`, `ai_hub_coworker_models`: lookup seed
- `ai_hub_supporters`: `data_id`, `type` (`skill`\|`prompt`\|`api-catalog`\|`coworker`), `user_id`, soft-delete; unique live `(type, data_id, user_id)`; max 20

`code`: user nhập lúc `POST /items`, 409 nếu trùng package chưa xóa mềm. Bump/edit **không** nhận/đổi `code`.

Link: parse URL, `origin` ∈ const. Avatar: string URL, assert Strapi origin như prompt.

### APIs (Bearer; PermissionGuard như prompt)

```
GET    /v1/ai-hub/coworker/items
GET    /v1/ai-hub/coworker/items/:id
GET    /v1/ai-hub/coworker/versions ...
GET    /v1/ai-hub/coworker/reviews ...
GET    /v1/ai-hub/coworker/my-permissions
GET    /v1/ai-hub/coworker/channels
GET    /v1/ai-hub/coworker/models
POST   /v1/ai-hub/coworker/items                    coworker_upload
PUT    /v1/ai-hub/coworker/items/:id/versions       coworker_upload
PUT    /v1/ai-hub/coworker/versions/:vid            coworker_upload OR coworker_approve
POST   .../approve | reject                         coworker_approve
PATCH  /items/:id/status                            coworker_upload OR coworker_approve
```

Không `PATCH /supporters`. `supporter_ids` trên create + bump + editVersion body; `replaceSupporters` trong cùng tx (package-level, hiệu lực ngay — không chờ approve, giống PIC).

### Quyền 4 WS (sau guard)

Helper: `canBump(user, pkg)` = upload ∧ (created_by ∨ supporter). `isWsSO(user, table)` = sentinel `resource_owners` `resource_id=0`.

| API | Service |
|---|---|
| POST items | upload ∨ SO |
| PUT items/:id/versions | canBump only (**không** SO, **không** approver) |
| PUT versions/:vid rejected | canBump + newest rejected |
| PUT versions/:vid pending | **chỉ SO**; skip locked fields nếu có (coworker không lock zip) |
| POST approve/reject | approve ∨ SO |
| PATCH status | creator ∨ supporter ∨ SO |

Flag detail: `isUpdate` = canBump; `canEditPending` = SO ∧ có pending; `canApprove`; `canToggleStatus`.

Gỡ approver-pending-edit hiện tại (prompt/skill/api-catalog). Approver seed có thể vẫn cầm upload — **service vẫn 403** bump không phải owner/supporter.

Inactive list: approver ∨ SO ∨ creator ∨ supporter (để thấy bản ẩn).

### SO wiring

Asset Hub 104 `table_name=NULL` không dùng được — 1 SO sẽ ôm 4 WS.

4 module con, chuyển permission xuống:

| path | table_name |
|---|---|
| `/asset-hub/skill` | `skill_packages` |
| `/asset-hub/prompt` | `prompt_packages` |
| `/asset-hub/api-catalog` | `api_catalog_packages` |
| `/asset-hub/coworker` | `coworker_packages` |

`HIERARCHY_MAP` null + `OWNER_ALL_TABLES` + `ROOT_OWNER_CONFIG` (resource_type riêng từng WS). **Không** `RULE_TARGET_TABLES` (không data_access rule).

`*_upload` `action='upload'` → own-all implied upload+approve (không dính exclude `action=create`). SO tạo + duyệt được. `isInOwnedScope` với id=0 **không** match package thật → dùng `isAiHubWorkspaceSO`.

Gán SO: role `resource_owners` sentinel, UI owner_assignments đã hỗ trợ OWNER_ALL.

### Touchpoints

- New: `src/modules/coworker/` (controller/query/upload/dto/specs), entities, migration tables+perms+seed lookups
- Shared: `ai_hub_supporters` entity + `AssetHubItemMetaService.replaceSupporters`; DTO `supporter_ids` trên 4 WS write
- Siết: `*-upload.service.ts` / query `isUpdate` / perm specs / seed approver
- SO: `hierarchy-config.ts`, migration modules, `OwnerScopeResolver` không đổi trừ helper SO
- `asset-hub` users picker: thêm `coworker_upload`/`coworker_approve`
- `latest-artifacts` stats: workspace coworker

## Risks

- Đổi module_id permission: role_permissions trỏ id cũ — migration phải **move** code, không tạo id mới nếu có thể, hoặc remap grants
- `supporter_ids` trên bump: đổi supporter khi đang pending phải qua SO `editVersion` (không bump được)
- SO implied upload: quên 403 ở `createVersion` → SO bump loạn mọi package
- Unique `code` vs soft-delete: unique partial `deleted_at IS NULL`

## Success

- Coworker tạo/bump/duyệt/ẩn như prompt; mã trùng 409; link sai domain 400
- Supporter+upload bump được; không upload 403; approver không bump/không sửa pending
- SO từng WS: tạo, sửa pending, duyệt, toggle; không bump package người khác
- Channel/model GET từ seed; không CRUD

## Next

`/ck:plan --tdd` với path `plans/261009-1424-ai-hub-coworker/brainstorm-summary.md`
