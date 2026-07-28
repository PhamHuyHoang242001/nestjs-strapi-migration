---
phase: 2
title: "Gate write rule APIs"
status: completed
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: Gate write rule APIs

## Overview
Áp `canManageRecord(..., perm_data_access_create)` vào các API tạo/sửa/xoá rule cho record thuộc `MANAGE_ENABLED_MODULES`. Module ngoài config giữ hành vi cũ.

## Requirements
- Functional:
  - `/data-access/create`, `/create-bulk`, `/update/:id`, `/delete/:id`, `/remove-link/:ruleId`: với mỗi (table, data_id) đích thuộc `MANAGE_ENABLED_MODULES` → yêu cầu `canManageRecord(caller, table, dataId, 'perm_data_access_create')` cho **mọi** dataId (all-or-nothing), else `403 not_record_manager`.
  - Table ngoài config → gate cũ (chỉ verb global). Backward-compatible.
- Non-functional: gate chạy trước transaction (fail-fast); write-authorization đọc ownership **trực tiếp DB** (không cache) hoặc đảm bảo invalidate đồng bộ (H6) để owner vừa được cấp edit không bị 403 do cache 120s.

## Architecture
- Đổi signature `create/update/delete/removeLink` nhận `caller: CallerContext` (thay/bổ sung `performedBy`). Controller (`data-access.controller.ts`) build caller từ `req.info` (đã có `@UserScope()`), truyền xuống; `performedBy` tiếp tục = username cho history.
- `create`: target = `resolveModule(dto.module_id).table_name` + từng `dto.data_ids`. Nếu `isManageEnabledTable(table)` → loop `canManageRecord`.
- `update/delete/removeLink`: target = `old.data_id` + `old.module.table_name`.
- **H6**: cho write-gate, `canManageRecord` đọc `queryService.getAccessibleRecords` **bypass cache** (đường DB trực tiếp) — vì đây là authorization cho mutation, không được dựa cache 120s. (Đọc-list ở Phase 3 có thể dùng cache.)
- Giữ nguyên hierarchy validation hiện có.

## Related Code Files
- Modify: `src/modules/data-access/data-access.service.ts` (gate trong create/update/delete/removeLink)
- Modify: `src/modules/data-access/data-access.controller.ts` (truyền caller context)
- Reference: `manage-authority.helper.ts` (Phase 1), `permission-query.service.ts` (đường DB không cache)
- Test: `data-access-write-gate.spec.ts`

## TDD — Tests First
1. **write-gate spec** (đỏ):
   - creator (edit-on-record ∧ create-verb) tạo rule trên report mình → OK.
   - user có create-verb nhưng KHÔNG edit-on-record → 403.
   - user có edit-on-record nhưng KHÔNG create-verb → 403 (verb thiếu).
   - super_admin / SO → OK bất kể.
   - create nhiều data_ids, sở hữu một phần → 403 (all-or-nothing).
   - update/delete/removeLink trên record không manage được → 403.
   - table ngoài `MANAGE_ENABLED_MODULES` → giữ hành vi cũ (không gate record-scope).
   - owner vừa được cấp edit (cache có thể stale) → vẫn OK vì write-gate đọc DB trực tiếp (H6).

## Implementation Steps
1. Viết spec (đỏ).
2. Đổi signature + truyền caller ở controller; grep hết call-site (`data-access.controller.ts:53,61,68,75,82`) cập nhật.
3. Thêm gate call đầu mỗi method (trước transaction) cho table thuộc config.
4. Cấu hình canManageRecord đọc DB trực tiếp cho write path.
5. Specs xanh + regression toàn bộ data-access spec (signature change).

## Success Criteria
- [ ] Gate write đúng ma trận (AC #1, #2, #5 global).
- [ ] Table ngoài config giữ nguyên (AC #6).
- [ ] Owner vừa cấp edit không bị 403 do cache (H6).
- [ ] Toàn bộ data-access spec xanh.

## Risk Assessment
- **Signature blast radius** → 5 call-site 1 file; cập nhật + specs cũ.
- **Cache stale write-gate (H6)** → write path đọc DB trực tiếp.
- **all-or-nothing** cho nhiều data_ids → test rõ.
