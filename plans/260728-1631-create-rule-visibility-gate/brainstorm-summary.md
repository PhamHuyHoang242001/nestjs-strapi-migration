# Brainstorm — Đồng bộ quyền tạo rule với visibility (records browser)

Date: 2026-07-28 · Status: agreed · Approach: Hướng 1 (KISS)

## Problem

Tạo data_access rule chỉ bị chặn bởi verb toàn cục `perm_data_access_create` (controller). `enforceManageGate` (record-level) **no-op** cho mọi table ngoài `MANAGE_ENABLED_MODULES` (= chỉ `bi_hub_diagnostic_reports`). → 6/7 `RULE_TARGET_TABLES` (gồm `bi_hub_reports`, `bi_payment_*`, `ma_tool_*`) **không** kiểm record-level: bất kỳ user có verb đều tạo được rule cho report họ không edit/SO/super_admin. Tái hiện được qua API.

Lệch thiết kế gốc (comment `manage-authority.helper.ts`): đúng phải là **verb ∧ (edit-on-record ∨ owner)**.

## Requirement (đã chốt với user)

- **Invariant:** user tạo/sửa được rule cho report X **⟺** report X hiện trong **records browser** (`getRecords`) của user đó. Đúng cả khi call API trực tiếp.
- Chuẩn visibility = **records browser** (picker), KHÔNG phải list() rule.
- Điều kiện = **verb ∧ visible** (giữ verb ở controller, thêm vế visible ở gate).
- Áp cho **tất cả write path**: create, create-bulk, update, handover.
- Table chỉ có owner-scope (không edit-code): **SO-owner ∨ super_admin** là đủ.

## Current flow (đã scout)

- Controller `data-access.controller.ts:45-50`: `PermissionGuard` + `@RequirePermission('perm_data_access_create')` (verb toàn cục), truyền user+client.
- Service `create()`: resolveModule (∈ RULE_TARGET_TABLES) → `enforceManageGate` (no-op 6/7 table) → hierarchyValidation (chỉ check ancestor allow-rule, KHÔNG check ownership) → transaction insert.
- `enforceManageGate` (`data-access.service.ts:92-110`): `if (!isManageEnabledTable) return` ← gốc lỗ hổng. Pass = `filterManageableRecords` all-or-nothing, `bypassCache:true`.
- Records browser `getRecords`: manage table → `getManageScopedRecords` (editable(create-verb) ∨ SO-owned); non-manage/owner-all → `getScopedRecords` (owner-chain; own-all qua `hasOwnerAllAssignment` sentinel).

## Chosen solution — Hướng 1: mở rộng gate

Sửa `enforceManageGate` để gate **mọi `RULE_TARGET_TABLES`**:

1. Đổi guard: `if (!isManageEnabledTable(tableName)) return;` → chỉ no-op khi `!caller` hoặc table ∉ `RULE_TARGET_TABLES` (create đã validate table ∈ set, nhưng gate nên tự guard để phòng thủ).
2. Pass khi: `filterManageableRecords(...)` chứa đủ mọi dataId **HOẶC** (table ∈ `OWNER_ALL_TABLES` ∧ `hasOwnerAllAssignment(table, roleIds)` → toàn bộ pass). Giữ all-or-nothing + `bypassCache:true`.
3. Verb giữ nguyên ở controller (verb ∧ visible thoả).
4. Không đổi read-path (getRecords vừa tối ưu).

### Điểm kỹ thuật bắt buộc (feasibility đã verify)

- ⚠️ **Own-all sentinel** `ma_tool_cstb_rpt_properties`: `isInOwnedScope` check `root.id = ANY([0])` → luôn false cho own-all owner → **khóa nhầm** nếu chỉ dùng `filterManageableRecords`. BẮT BUỘC thêm nhánh `hasOwnerAllAssignment` (mirror `getScopedRecords`).
- Owner-chain tables (`bi_hub_reports`, `bi_payment_*`, `bi_hub_bicc_departments`): `isInOwnedScope` walk đúng chuỗi → khớp browser ✓.
- `MANAGE_VERB = perm_data_access_create` = đúng verb controller ✓.
- Verify `getUserOwnerScope` lọc active-role đồng nhất `getScopedRecords` (tránh lệch tinh vi).

## Approaches đã cân nhắc

| Hướng | Ưu | Nhược |
|---|---|---|
| **1. Mở rộng gate (CHỌN)** | nhỏ, tái dùng helper, đóng lỗ ngay | scope quyết định ở 2 nơi → rủi ro drift |
| 2. Predicate chung (DRY) | browser⟺gate bảo đảm bằng cấu trúc | refactor lớn, đụng read-path vừa tối ưu |
| 3. Guard @RequireOwnerScope | tầng route | không fit: create nhắm mảng data_ids, all-or-nothing |

Ghi chú: có thể nâng lên Hướng 2 ở plan sau nếu muốn DRY bền vững.

## Acceptance criteria

- User có verb nhưng KHÔNG edit/SO/super trên `bi_hub_reports` → create/update/handover rule cho record đó **403** (kể cả call API).
- SO-owner (role sở hữu subtree) → tạo được rule cho record trong subtree.
- super_admin → tạo được mọi rule (như cũ).
- Own-all owner `ma_tool_cstb_rpt_properties` → KHÔNG bị khóa nhầm.
- `bi_hub_diagnostic_reports` giữ nguyên hành vi hiện tại.
- All-or-nothing: lô data_ids có 1 record ngoài quyền → reject cả lô.

## Scope

- IN: `enforceManageGate` mở rộng; áp create/create-bulk/update/handover; test đỏ + test không-khóa-nhầm.
- OUT: refactor DRY (Hướng 2); đổi read-path; đổi mô hình verb/permission.

## Risks

- Khóa nhầm own-all owner nếu quên nhánh sentinel → mitigation: test riêng.
- Lệch `getUserOwnerScope` vs `getScopedRecords` active-role → mitigation: verify + test.
- Có thể chặn admin cũ chỉ-có-verb (không SO) đang dựa lỗ hổng → xác nhận nghiệp vụ: đúng ý siết.

## Open questions

- Admin hiện đang tạo rule chỉ nhờ verb (không SO/edit) — sau khi siết họ cần được cấp SO hoặc super_admin. Có user/role nào đang phụ thuộc hành vi cũ không?
