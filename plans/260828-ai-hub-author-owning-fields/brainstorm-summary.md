---
title: AI Hub field rename + owning unit
date: 2026-08-28
status: agreed
---

# Brainstorm: AI Hub — tác giả, khối chủ quản, trung tâm/phòng ban

## Problem

Product đổi label AI Hub:

- Cán bộ quản lý → Tác giả
- Đơn vị chủ quản → Khối chủ quản
- Thêm freetext Trung tâm/phòng ban chủ quản

BE hiện: `responsible_user_ids` + `publisher_id` (`ai_hub_publishers`, seed "Khối …") trên skill / prompt / api-catalog. Không có cột phòng ban.

## Requirements (chốt)

| Item | Quyết định |
|---|---|
| Workspace | skill + prompt + api-catalog (DTO chung `AssetHubItemMetaFieldsDto`) |
| JSON | hard cut, FE deploy cùng lúc |
| Keys | `author_ids` (was `responsible_user_ids`), `owning_block_id` (was `publisher_id`), `owning_unit_name` (mới) |
| DB | **giữ** `publisher_id` + bảng `*_responsible`. Chỉ map JSON. Thêm cột `owning_unit_name` trên 3 package tables |
| `owning_unit_name` | optional, không filter list, cap `varchar(500)`, empty/omit OK |
| Out of scope | FE repo, rename join tables, filter/search field mới, unlimited TEXT |

## Approaches

| | Pros | Cons |
|---|---|---|
| A. JSON rename + map nội bộ, cột DB cũ (chọn) | Ít migration; join/filter hiện tại không đụng SQL cột | Dual name JSON vs DB — comment rõ |
| B. RENAME COLUMN `publisher_id` | JSON=DB | 3 bảng + seed + mọi test SQL; 0 giá trị runtime |
| C. Chỉ Swagger + field mới | 0 breaking | User muốn hard cut JSON |

## Design (A)

**Write (create + bump version):** DTO chung đổi property. Service map `author_ids` → `assertUsers` / replace PIC; `owning_block_id` → `assertPublisher` + `package.publisher_id`; `owning_unit_name` trim, max 500, null nếu empty.

**Read (list/detail):** response `{ author_ids` hoặc `authors: {id,email}[]` — **giữ shape hiện tại đổi tên field**: `responsible_users` → `authors`; `publisher` object giữ `{id,name}` nhưng key JSON `owning_block` (hoặc `owning_block_id` + nested). Chốt khi plan: **response `authors` (array user) + `owning_block: {id,name}` + `owning_unit_name`** để FE không gãy nested. Input write dùng scalar ids.

**Migration:** `ALTER TABLE skill_packages / prompt_packages / api_catalog_packages ADD owning_unit_name varchar(500) NULL`.

**Tests:** DTO reject old keys; persist/read new keys; 3 workspace; bump ghi `owning_unit_name`.

## Risks

- Hard cut: FE cũ 400. Cần ship đồng bộ.
- Dual naming JSON vs DB — comment entity/DTO bắt buộc.
- Response nested rename (`responsible_users` → `authors`, `publisher` → `owning_block`) cũng breaking; cùng hard cut.

## Success

- Create/bump 3 workspace: `author_ids` + `owning_block_id` bắt buộc như PIC/publisher cũ; `owning_unit_name` optional.
- List/detail trả `authors`, `owning_block`, `owning_unit_name`.
- Key cũ không còn trên DTO/response.
- Không query param mới.

## Next

`/ck:plan` (default) — feature mới vừa phải, test có sẵn nhưng không phải refactor logic nghiệp vụ nặng. `--tdd` nếu muốn khóa contract JSON trước.
