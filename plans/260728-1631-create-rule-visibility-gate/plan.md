---
title: Create-rule visibility gate (đồng bộ quyền tạo rule với records browser)
description: >-
  Siết quyền tạo/sửa data_access rule: chỉ record hiện trong records browser
  (getRecords) của caller mới tạo được rule, enforced server-side dù call API.
status: completed
priority: P1
branch: main
tags:
  - security
  - authorization
  - data-access
blockedBy: []
blocks: []
created: '2026-07-28T09:33:06.799Z'
createdBy: 'ck:plan'
source: skill
---

# Create-rule visibility gate (đồng bộ quyền tạo rule với records browser)

## Overview

Lỗ hổng: tạo/xóa data_access rule chỉ bị chặn bởi verb toàn cục. Gate record-level `enforceManageGate` **no-op** cho 6/7 `RULE_TARGET_TABLES` (chỉ `bi_hub_diagnostic_reports` được gate). → user có verb tạo/xóa được rule cho report không edit/SO/super_admin, tái hiện qua API.

Fix (Hướng 1 — KISS): mở rộng `enforceManageGate` gate **mọi `RULE_TARGET_TABLES`**, pass = `filterManageableRecords` (editOnRecord ∧ verb, ∨ SO-owned) **∨** own-all sentinel **∨** super_admin. Verb **theo action** (create/update → `perm_data_access_create`; delete/removeLink → `perm_data_access_delete`). TDD: test đỏ tái hiện lỗ hổng trước, rồi vá.

Chi tiết + red-team: xem `brainstorm-summary.md` và mục `## Red Team Review` dưới.

## Yêu cầu phân quyền (goal)

Caller chỉ tạo/sửa/xóa được rule cho record R khi có **authority quản lý R**: `editOnRecord(R) ∨ SO-owner(R) ∨ own-all(table) ∨ super_admin`. Đây là predicate `filterManageableRecords` (mô hình manage-authority), enforced server-side dù call API.

**KHÔNG** ghép parity byte-đúng với `getRecords` — `getRecords` giữ nguyên, không đụng. (Đọc getRecords chỉ để hiểu luồng yêu cầu.)

## Scope

- IN: `enforceManageGate` mở rộng + verb-per-action; áp create/update/delete/removeLink (cùng gate). Test đỏ + không-khóa-nhầm.
- OUT: **handover** (đã hard-reject mọi table ngoài manage tại `:1042`, không dính lỗ hổng); **getRecords/list** (không đụng); admin-client (repo chỉ user-client, userId luôn có); data cũ/deploy-migration (chỉ sửa logic mới); `CreatorAccessGrantService` (self-grant lúc tạo record, không phải endpoint quản-lý-rule).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Failing tests](./phase-01-failing-tests.md) | Completed |
| 2 | [Extend gate](./phase-02-extend-gate.md) | Completed |
| 3 | [Verify & regression](./phase-03-verify-regression.md) | Completed |

## Key facts (đã scout + red-team verify)

- `enforceManageGate` (`data-access.service.ts:92`) gate ở: create `:646`, update `:761`, delete `:879`, removeLink `:954`. Sửa 1 hàm → phủ cả 4.
- `MANAGE_VERB = perm_data_access_create` (`:82`) hardcode → phải đổi thành **tham số verbCode** truyền theo call site (delete/removeLink dùng `perm_data_access_delete` per controller `:72,:80`).
- ⚠️ `enforceManageGate` **chưa có roleIds**; nhánh own-all cần plumb role lookup (`SELECT role_id FROM user_roles WHERE user_id=$1 AND deleted_at IS NULL`, giống `:1393`) rồi gọi `hasOwnerAllAssignment(table, roleIds)` (`:1493`) — kẻo own-all owner `ma_tool_cstb_rpt_properties` bị khóa nhầm.
- ⚠️ `isInOwnedScope` trả false cho own-all sentinel (id=0 không match row thật) → bắt buộc nhánh `hasOwnerAllAssignment`.
- Handover gọi `canManageRecord` (KHÔNG phải `filterManageableRecords`) và hard-reject non-manage table `:1042` → **ngoài scope** (đã đúng).

## Known limitation (accepted)

Nhánh owner của `filterManageableRecords` → `isInOwnedScope` đọc `getUserOwnerScope` (cache, có filter `role.status='active'`), khác `getScopedRecords` (SQL live, không filter status). Vì KHÔNG yêu cầu parity với browser, chấp nhận: gate dùng chuẩn active-role chặt hơn cho write. SO vừa-được-cấp có thể lệch cache ngắn hạn — chấp nhận (data cũ/edge không quan tâm).

## Dependencies

- Liên quan (không blocking): `260726-2320-record-grant-authority-handover` — feature manage-authority gốc; plan này mở rộng gate sang mọi rule-target table + verb-per-action.

## Red Team Review

### Session — 2026-07-28
**Findings:** 13 (5 accepted, 8 rejected/out-of-scope) · **Reviewers:** Security Adversary, Assumption Destroyer, Failure Mode Analyst
**Severity gốc:** 4 Critical, 6 High, 3 Medium — phần lớn xoay quanh "gate ≠ browser parity" mà user đã loại khỏi yêu cầu (getRecords không đụng).

| # | Finding | Sev | Disposition | Applied |
|---|---------|-----|-------------|---------|
| A | delete/removeLink gate bằng create-verb → khóa nhầm delete-only admin | High | **Accept** | Phase 2 (verb-per-action) |
| E | `enforceManageGate` chưa plumb roleIds → nhánh own-all sai → own-all owner khóa nhầm | High | **Accept** | Phase 2 |
| D | Test Phase 1 mock `filterManageableRecords→[]` = vacuous; own-all path (`hasOwnerAllAssignment` chạy code thật) không được test đúng | High | **Accept** | Phase 1 (test own-all path thật qua mock connection.query) |
| F | Handover no-op (hard-reject `:1042`, gọi `canManageRecord`); plan.md:40 cũ sai | Med | **Accept** | Bỏ handover khỏi scope; sửa plan.md |
| G | Invariant phát biểu theo browser đã-lọc/phân-trang → sai chữ | Med | **Accept** | Phát biểu lại theo authority predicate |
| 1 | Gate (filterManageableRecords) ≠ getScopedRecords cho non-manage table (edit-branch, allow-leak) | Crit | **Reject (out-of-scope)** | Completed |
| — | Active-role skew (status filter) gate vs browser | High | **Reject (out-of-scope)** | Không parity browser; active-role chặt hơn cho write là chấp nhận |
| — | Cache staleness owner branch (isInOwnedScope không bypassCache) | High | **Reject (accepted-limit)** | Ghi ở "Known limitation"; user không quan tâm edge/data cũ |
| B | admin-client userId=undefined → 403 | High | **Reject** | Repo chỉ user-client, userId luôn có |
| C | Deploy flip khóa admin sở hữu rule cũ | High | **Reject** | User: chỉ sửa logic mới, không quan tâm data cũ |
| H | create-bulk all-or-nothing + N-query self-DoS | Med | **Reject (by-design)** | all-or-nothing là intended; batch nhỏ |
| I | CreatorAccessGrantService cũng ghi DataAccess | Med | **Reject (out-of-scope)** | Self-grant lúc tạo record, không phải quản-lý-rule |
| — | update re-check OLD data_id | — | **Reject (non-issue)** | data_id immutable — reviewer tự xác nhận |

### Whole-Plan Consistency Sweep
- Xóa mọi tham chiếu "handover" trong scope thực thi (còn lại chỉ nêu lý do OUT).
- Sửa claim sai plan.md:40 cũ ("handover gọi filterManageableRecords :1058") → handover gọi `canManageRecord`, ngoài scope.
- Thay "invariant create⟺browser" → "authority predicate" xuyên suốt plan + phase.
- Thêm verb-per-action + roleIds-plumbing vào Phase 2; test own-all thật vào Phase 1.
- Không còn mâu thuẫn tồn đọng.
