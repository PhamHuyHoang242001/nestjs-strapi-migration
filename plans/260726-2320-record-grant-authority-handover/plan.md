---
title: "Record Grant-Authority via Edit + Rule-Verb (derive)"
description: ""
status: completed
priority: P2
branch: "main"
tags: []
blockedBy: []
blocks: []
created: "2026-07-27T03:28:55.311Z"
createdBy: "ck:plan"
source: skill
---

# Record Grant-Authority via Edit + Rule-Verb (derive)

## Overview

Người tạo report tự động có quyền **phân quyền** (tạo/sửa/xoá `data_access` rule) cho report mình tạo, và bàn giao cho người khác khi đổi phòng — **không tạo permission mới**, suy ra từ quyền đã có.

**Quy tắc lõi:** `canManage(user, record) = super_admin OR SO OR (edit-on-record ∧ rule-verb)`. Creator đã có `bh_diag_report_edit` (action=`update`) record-scope qua `CreatorAccessGrantService` sẵn có → không cần tạo/auto-grant gì mới. Chỉ **cải tiến API cũ** để gate theo công thức này.

**Trọng tâm:** diagnostic (`bi_hub_diagnostic_reports`). Descriptive (`bi_hub_reports`) = exemplar doc-only, chưa wire config. Mode: `--tdd`. Design: [`reports/brainstorm-summary.md`](./reports/brainstorm-summary.md).

## Key Decisions (user-confirmed 2026-07-27)

- Bỏ hướng permission `manage_access` mới → **derive từ edit + rule-verb**.
- Bỏ "1 owner độc quyền" → **manage = editor** (nhiều editor có thể cùng quản).
- Gate theo API: create/mutate rule = `editOnRecord ∧ perm_data_access_create`; list rule = `editOnRecord ∧ perm_data_access_view`; records browser = `editOnRecord ∧ perm_data_access_create`. (+ super_admin/SO bypass mọi API.)
- Handover = gỡ edit(RUD) của A + cấp cho B qua `data_access` sẵn có (không API mới).
- Config `MANAGE_ENABLED_MODULES` = [diagnostic] → sau thêm descriptive.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Foundations config caller-context and junction fix](./phase-01-foundations-config-caller-context-and-junction-fix.md) | Done |
| 2 | [Gate write rule APIs](./phase-02-gate-write-rule-apis.md) | Done |
| 3 | [Gate read rule and records browser APIs](./phase-03-gate-read-rule-and-records-browser-apis.md) | Done |
| 4 | [Handover via edit transfer](./phase-04-handover-via-edit-transfer.md) | Done |
| 5 | [Descriptive exemplar (doc-only)](./phase-05-rollout-backfill-and-descriptive-exemplar.md) | Done |

## Implementation Result (2026-07-27)

Delivered on branch `main` (uncommitted). Doc: [`docs/record-grant-authority.md`](../../docs/record-grant-authority.md).

- **P1** `MANAGE_ENABLED_MODULES` + `isManageEnabledTable` (`hierarchy-config.ts`); `ManageAuthorityService` + `CallerContext`/`buildCallerContext` (`helpers/manage-authority.helper.ts`); junction `is_deleted` fix (`permission-query.service.ts` `queryDataIds` + `queryUsersForRecord`).
- **P2** write gate on create/update/delete/removeLink (`perm_data_access_create`, all-or-nothing, DB-direct bypassCache) via `enforceManageGate`→`filterManageableRecords`; controller threads `CallerContext`.
- **P3** list edit-scope (additive OR-branch, view-verb) + records-browser manage-scope (create-verb, super_admin broad / SO owned) via `getManageScopedRecords`.
- **P4** atomic `handover` (`grantEditToUser` + `stripUserEditGrant`) + `HandoverDataAccessDto` + thin POST `/handover` route; keeps third-party rules; invalidates A/B/table.
- **P5** doc-only exemplar; `bi_hub_reports` intentionally NOT wired.

Tests: 51 new (manage-authority, write-gate, list-edit-scope, records-browser-edit-scope, handover, junction), all pass. 4 suites fail identically on clean HEAD (pre-existing, unrelated). Code review: no Critical/High; batched write-gate per review feedback.

## Dependencies

- **Soft-related:** `plans/260723-1600-bi-payment-program-permission-rebuild` (in-progress) đụng cùng vùng `data-access`. Plan này chỉ **thêm gate** vào `DataAccessService` (không đổi 8 code bp), coordinate ở signature `create/update/delete/removeLink`.

## Global Acceptance Criteria

1. Creator diagnostic (có edit record-scope) + có `perm_data_access_create` → tạo rule cho report đó OK; user có verb nhưng **không** edit-on-record → **403** trên report đó.
2. User có edit-on-record nhưng **không** `perm_data_access_create` → không tạo rule được.
3. Handover: gỡ edit A + cấp edit B → B quản được, A hết quyền (sửa + phân quyền).
4. `/data-access/list` chỉ trả rule của record user edit-được (∧ view-verb); records browser chỉ trả record user edit-được (∧ create-verb).
5. super_admin & SO bypass mọi gate.
6. Module ngoài `MANAGE_ENABLED_MODULES` → giữ hành vi cũ (backward-compatible).

## Red Team (đã chạy 2026-07-27 trên hướng cũ)

Hướng derive **hoá giải** C1/C2/H1/H4 (không còn permission manage_access) và C3 (bỏ 1-owner). **Giữ fix trong scope:** C4 (junction `is_deleted`), H3 (caller id-namespace), H6 (cache staleness write-gate). **Hoãn (Deferred):** H5 (backfill namespace), H7 (rollout/feature-flag) — xem §Deferred. Chi tiết findings: [`reports/brainstorm-summary.md`](./reports/brainstorm-summary.md) §5.

## Validation Log

### Session 1 — 2026-07-27 (đã chốt)
1. **Handover** = **1 service method atomic** (gỡ edit A + cấp edit B trong 1 transaction), auth = **owner-self OR admin/super_admin/SO**; expose qua route mỏng trên controller cũ (không module mới). → Phase 4.
2. **editOnRecord** = **chỉ record-scoped edit grant** (data_access). Global-edit-verb qua role KHÔNG tính là manage (broad case dựa super_admin/SO). → Phase 1/2/3.
3. **Handover giữ nguyên rule bên thứ 3**: chỉ chuyển edit A→B; rule A đã cấp cho C vẫn còn. → Phase 4.
4. **Backfill + feature-flag rollout: TẠM HOÃN** — round này chỉ làm logic gate mới cho chuẩn. Phase 5 rút còn **descriptive exemplar doc-only**. Backfill/rollout đưa vào Deferred (làm khi go-live production có data cũ).

## Deferred (ngoài scope round này)

- Backfill edit-grant cho diagnostic cũ theo `created_by_admin_id` (H5) — làm khi go-live có record cũ thiếu edit-grant.
- Feature-flag rollout per-module (H7) — kèm backfill khi go-live.
- Descriptive `bi_hub_reports` wire config — chờ create-flow + cột creator.
