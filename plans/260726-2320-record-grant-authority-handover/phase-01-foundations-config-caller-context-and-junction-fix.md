---
phase: 1
title: "Foundations config caller-context and junction fix"
status: completed
priority: P1
effort: "1d"
dependencies: []
---

# Phase 1: Foundations config, caller-context, junction fix

## Overview
Nền cho gate derive: config module bật tính năng, resolver `canManageRecord`, thread caller context an toàn namespace, và fix bug junction `is_deleted` trong resolve accessible records.

## Requirements
- Functional:
  - `MANAGE_ENABLED_MODULES` (theo table_name) + helper `isManageEnabledTable(table)`; init `['bi_hub_diagnostic_reports']` (descriptive thêm sau).
  - Helper `canManageRecord(caller, tableName, recordId, verbCode)`: `super_admin` OR `SO(isInOwnedScope)` OR (`editOnRecord` ∧ caller giữ `verbCode`). `editOnRecord = getAccessibleRecords(userId, table, EDIT_CODE).includes(recordId)`.
  - Resolve `EDIT_CODE` theo module (permission `module_id=mod.id AND action='update' AND is_active`).
- Non-functional: caller context namespace-safe (user-client vs admin-client); fix junction filter không đổi hành vi hợp lệ khác.

## Architecture
- **Config** `hierarchy-config.ts`: `MANAGE_ENABLED_MODULES: Set<string>` + `isManageEnabledTable()`. Comment: phải ⊆ `RULE_TARGET_TABLES` (inline, không cần load-guard — theo tiền lệ `OWNER_ALL_TABLES`).
- **Caller context (H3)**: định nghĩa `CallerContext { userId?: number; isSuperAdmin: boolean; client?: string }`. Controller build từ `req.info.user` + `req.info.client`. Chỉ tin `userId` khi `client==='user'` và `userId` là số hợp lệ; admin-client/thiếu userId → `isSuperAdmin=false, userId=undefined`. Gate: `userId===undefined && !isSuperAdmin && !SO` ⇒ fail-closed (ForbiddenException), KHÔNG bao giờ gọi `getAccessibleRecords(undefined,...)`.
- **canManageRecord** đặt trong `DataAccessService` (hoặc helper `manage-authority.helper.ts`). Thứ tự: super_admin → SO (`OwnerScopeResolverService.isInOwnedScope`) → editOnRecord ∧ verb.
- **Junction is_deleted fix (C4)**: `permission-query.service.ts` — thêm `AND {alias}.is_deleted IS NOT TRUE` cho junction `data_access_users`/`data_access_roles` ở `queryDataIds` + `queryUsersForRecord` (hiện chỉ check `deleted_at`, permission-query.service.ts:262). Đảm bảo record deleted qua flag-path không leak.

## Related Code Files
- Modify: `src/modules/data-access/constants/hierarchy-config.ts`
- Create: `src/modules/data-access/helpers/manage-authority.helper.ts` (hoặc method trong service)
- Modify: `src/common/authorization/services/permission-query.service.ts` (junction is_deleted)
- Reference: `src/common/authorization/services/owner-scope-resolver.service.ts` (isInOwnedScope), `permission-cache.service.ts:52` (getAccessibleRecords), `permission.guard.ts:26` (super_admin detection = user.type), `bearer.guard.ts` (user shape / client)
- Test: `manage-authority.helper.spec.ts`, mở rộng `permission-query.service.spec.ts`

## TDD — Tests First
1. **junction is_deleted spec** (đỏ): record có junction row bị set `is_deleted=true` (deleted_at null) → `getAccessibleRecords` KHÔNG trả record đó.
2. **canManageRecord spec** (đỏ):
   - super_admin → true bất kể.
   - SO của record → true.
   - user có edit-on-record ∧ verb → true.
   - user có edit-on-record nhưng KHÔNG verb → false.
   - user có verb nhưng KHÔNG edit-on-record → false.
   - userId undefined (admin-client) & không super_admin/SO → false (fail-closed), không query với undefined.
   - module ngoài `MANAGE_ENABLED_MODULES` → helper không được gọi (caller quyết định); config membership test.

## Implementation Steps
1. Viết specs (đỏ).
2. Thêm config + helper `isManageEnabledTable`.
3. Thêm `CallerContext` + `canManageRecord` (resolve EDIT_CODE động theo module).
4. Fix junction `is_deleted` ở permission-query.
5. Specs xanh; chạy toàn bộ authorization + data-access specs (regression junction fix).

## Success Criteria
- [ ] `isManageEnabledTable` + `canManageRecord` hoạt động đúng ma trận trên.
- [ ] Junction is_deleted fix xanh, không regression.
- [ ] Caller context namespace-safe, fail-closed khi thiếu userId.

## Risk Assessment
- **Junction fix ảnh hưởng resolve chung** → chạy full authorization spec; fix mirror đúng dual-column convention.
- **super_admin detection** chỉ `user.type` (permission.guard.ts:26) → dùng đúng nguồn, không tự chế.
- **EDIT_CODE resolve sai module** → resolve động theo (module_id, action='update'); nếu thiếu → coi như không edit-enabled (log).
