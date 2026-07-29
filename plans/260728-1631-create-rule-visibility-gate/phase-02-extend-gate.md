---
phase: 2
title: Extend gate
status: completed
priority: P1
effort: 3h
dependencies:
  - 1
---

# Phase 2: Extend gate (green)

## Overview
Mở rộng `enforceManageGate` gate mọi `RULE_TARGET_TABLES` + nhánh own-all (plumb roleIds) + verb-per-action. Làm test Phase 1 xanh hết.

## Requirements
- Functional: pass = `filterManageableRecords(verbCode)` phủ đủ ids **∨** (own-all table ∧ `hasOwnerAllAssignment`) **∨** super_admin. Verb theo action.
- Non-functional: giữ `bypassCache:true`, all-or-nothing; **KHÔNG** đụng read-path (`getRecords`/`list`) và **KHÔNG** đụng handover.

## Architecture
Một điểm sửa chính `enforceManageGate` (phủ create/update/delete/removeLink). Thêm tham số `verbCode`.

```
private async enforceManageGate(caller, tableName, dataIds, verbCode) {
  if (!caller) return;
  if (!RULE_TARGET_TABLES.has(tableName)) return;   // phòng thủ (create đã validate)
  if (caller.isSuperAdmin) return;                  // super_admin — quản mọi record

  // own-all: sentinel không match isInOwnedScope → resolve riêng (plumb roleIds)
  if (OWNER_ALL_TABLES.has(tableName)) {
    const roleRows = await this.connection.query(
      'SELECT role_id FROM user_roles WHERE user_id = $1 AND deleted_at IS NULL', [caller.userId]);
    const roleIds = roleRows.map(r => r.role_id);
    if (await this.hasOwnerAllAssignment(tableName, roleIds)) return;
    throw new ForbiddenException('not_record_manager');
  }

  const manageable = new Set(
    await this.manageAuthority.filterManageableRecords(caller, tableName, dataIds, verbCode, { bypassCache: true }));
  if (dataIds.some(id => !manageable.has(id))) throw new ForbiddenException('not_record_manager');
}
```

Call sites truyền verb theo action:
- create `:646` → `perm_data_access_create`
- update `:761` → `perm_data_access_create`
- delete `:879` → `perm_data_access_delete`
- removeLink `:954` → `perm_data_access_delete`

## Related Code Files
- Modify: `src/modules/data-access/data-access.service.ts`
  - `enforceManageGate` (`:92-110`) — guard `RULE_TARGET_TABLES`, thêm `verbCode` param + nhánh own-all + super_admin short-circuit.
  - 4 call site (`:646`,`:761`,`:879`,`:954`) — truyền verbCode đúng action.
  - `MANAGE_VERB` (`:82`) — giữ làm hằng cho create/update (hoặc thay bằng 2 hằng CREATE_VERB/DELETE_VERB cho rõ).
- Read: `constants/hierarchy-config.ts` (`RULE_TARGET_TABLES`, `OWNER_ALL_TABLES`), `helpers/manage-authority.helper.ts`.
- **KHÔNG sửa:** `getRecords`, `getManageScopedRecords`, `getScopedRecords`, `list`, `handover`.

## Implementation Steps
1. Import `RULE_TARGET_TABLES` vào service (đã có `OWNER_ALL_TABLES`, `isManageEnabledTable`).
2. Đổi chữ ký `enforceManageGate(..., verbCode: string)`; đổi guard `isManageEnabledTable` → `RULE_TARGET_TABLES`.
3. Thêm super_admin short-circuit + nhánh own-all (plumb roleIds bằng đúng query `user_roles ... deleted_at IS NULL`).
4. Truyền `verbCode` từ 4 call site theo action (2 hằng: create/update = create-verb; delete/removeLink = delete-verb).
5. Compile: `npx tsc --noEmit` sạch; không lỗi eslint mới vùng sửa.

## Success Criteria
- [ ] Toàn bộ test Phase 1 PASS (lỗ hổng đóng; own-all/SO/super không khóa nhầm; delete-only-editor xóa được).
- [ ] `bi_hub_diagnostic_reports` hành vi không đổi.
- [ ] `getRecords`/`list`/`handover` KHÔNG bị sửa.
- [ ] `tsc --noEmit` exit 0; không lỗi eslint mới.

## Risk Assessment
- Quên nhánh own-all / plumb roleIds sai → khóa nhầm own-all owner (Finding E; Phase 1 bước 5 bắt).
- Truyền sai verb ở call site → khóa nhầm delete-only (Finding A; Phase 1 bước 2 bắt).
- Known limitation (chấp nhận): nhánh owner của `filterManageableRecords` dùng cache + `role.status='active'`, lệch nhẹ browser — user không yêu cầu parity.
