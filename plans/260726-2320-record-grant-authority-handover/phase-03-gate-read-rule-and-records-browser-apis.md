---
phase: 3
title: "Gate read rule and records browser APIs"
status: completed
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 3: Gate read rule + records browser APIs

## Overview
Scope các API đọc theo edit-on-record: `/data-access/list` (∧ view-verb) và records browser `/report-access/records/:table` (∧ create-verb), cho module thuộc `MANAGE_ENABLED_MODULES`.

## Requirements
- Functional:
  - `/data-access/list`: chỉ trả rule của record mà caller `editOnRecord ∧ perm_data_access_view` (+ super_admin/SO thấy hết). Module ngoài config: giữ scope cũ.
  - `/report-access/records/:table`: chỉ trả record caller `editOnRecord ∧ perm_data_access_create` (+ super_admin/SO). (User-confirmed: list record dùng create-verb, không view-verb.)
- Non-functional: đọc-list có thể dùng cache getAccessibleRecords (khác write-gate); giữ pagination + shape response.

## Architecture
- **`/data-access/list`** (`DataAccessService.list`): hiện scope qua `buildAccessibleCTE` (owner accessible). Bổ sung: với module thuộc config, giới hạn nhóm record theo `editOnRecord` set của caller (`getAccessibleRecords(userId, table, EDIT_CODE)`) và yêu cầu caller giữ `perm_data_access_view`. super_admin/SO giữ đường unscoped/owner như hiện tại.
- **records browser** (`getScopedRecords`/`getRecords`, `report-access-records.controller.ts`): hiện scope theo owner-scope (`buildOwnerJoinChain`). Đổi: với table thuộc config, scope theo `editOnRecord` set ∩ (caller giữ `perm_data_access_create`); super_admin/SO giữ broad scope. Controller hiện gate `@RequirePermission('perm_data_access_create')` — giữ, thêm record-scope theo edit.
- Verb-check (`perm_data_access_view`/`create`) lấy từ caller permission set (getPermissions) — không đổi guard, chỉ thêm điều kiện scope trong service.

## Related Code Files
- Modify: `src/modules/data-access/data-access.service.ts` (`list`, `getScopedRecords`, `getRecords`)
- Modify: `src/modules/data-access/report-access-records.controller.ts` (truyền caller context nếu cần)
- Reference: `helpers/owner-scope-helpers.ts` (buildAccessibleCTE/buildOwnerJoinChain), `manage-authority.helper.ts`
- Test: `data-access-list-edit-scope.spec.ts`, `records-browser-edit-scope.spec.ts`

## TDD — Tests First
1. **list edit-scope spec** (đỏ):
   - caller edit-on-record R + có view-verb → list trả rule của R.
   - caller không edit-on-record R → R không xuất hiện.
   - caller edit-on-record nhưng thiếu view-verb → không trả (hoặc [] theo contract list hiện tại).
   - super_admin/SO → thấy như cũ.
   - module ngoài config → scope cũ.
2. **records browser edit-scope spec** (đỏ):
   - caller edit-on-record ∧ create-verb → record xuất hiện trong browser.
   - edit nhưng thiếu create-verb → không xuất hiện.
   - không edit → không xuất hiện.
   - super_admin/SO → broad scope.

## Implementation Steps
1. Viết specs (đỏ).
2. Bổ sung edit-scope vào `list` (∧ view-verb) cho module config.
3. Bổ sung edit-scope vào `getScopedRecords`/`getRecords` (∧ create-verb).
4. Truyền caller context tới report-access controller nếu chưa có.
5. Specs xanh + regression list/records-browser cũ.

## Success Criteria
- [ ] `/data-access/list` scope theo edit ∧ view-verb (AC #4).
- [ ] records browser scope theo edit ∧ create-verb (AC #4).
- [ ] super_admin/SO + module-ngoài-config giữ hành vi cũ.

## Risk Assessment
- **Đổi scope query** có thể ảnh hưởng response cũ → giữ đường super_admin/SO/unscoped; chỉ siết cho non-privileged trên module config.
- **Phân biệt view-verb vs create-verb đúng API** → test riêng từng API.
- **Performance** (thêm getAccessibleRecords) → dùng cache cho đường đọc.
