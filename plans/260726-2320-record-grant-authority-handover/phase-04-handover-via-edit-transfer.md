---
phase: 4
title: "Handover via edit transfer"
status: completed
priority: P2
effort: "1d"
dependencies: [2]
---

# Phase 4: Handover via edit transfer

## Overview
Bàn giao report = chuyển quyền edit (RUD) từ A sang B. Vì quyền manage suy ra từ edit, chuyển edit là chuyển luôn quyền phân quyền. Tái dùng cơ chế `data_access` sẵn có, không thêm API mới nếu tránh được.

## Requirements
- Functional:
  - Bàn giao 1 hoặc nhiều report: gỡ grant edit(RUD) record-scope của A + cấp cho B; **giữ nguyên** các rule khác trên record (kể cả rule A đã cấp cho bên thứ 3).
  - Auth: caller là người **manage được** mọi record đó (`canManageRecord`) HOẶC super_admin/SO.
  - B sau bàn giao: manage được (nếu B có `perm_data_access_create`); A: hết edit → hết manage.
- Non-functional: atomic (1 transaction, all-or-nothing); invalidate cache A & B **và** `invalidateByTable` sau commit (H6); history log.

## Architecture
<!-- Updated: Validation Session 1 — atomic method (b), owner-self+admin, giữ rule bên thứ 3 -->
- **Cơ chế (đã chốt): 1 service method `handover` atomic.** Trong 1 transaction: copy RUD grant của A→B, soft-delete grant của A. Đảm bảo A-mất-B-nhận nguyên tử (không cửa sổ 2 trạng thái). Expose qua **route mỏng** trên controller data-access sẵn có (không module mới).
- **Move logic**: xác định các `user_data_access` RUD (read/update/delete, record-scoped) của A trên (module, dataId) — soft-delete + insert cho B (giống creator-grant shape). **Giữ nguyên** mọi rule khác trên record — kể cả rule A đã cấp cho bên thứ 3 (vd view cho C): KHÔNG gỡ (đã chốt).
- **Auth (đã chốt)**: caller = `canManageRecord(caller, table, dataId, 'perm_data_access_create')` cho **mọi** dataId (owner-self) **HOẶC** super_admin/SO.
- **Cache**: sau commit → `invalidateUser(A)`, `invalidateUser(B)`, `invalidateByTable(table)` (H6 — create/update/delete cũ đều gọi invalidateByTable: data-access.service.ts:604,731,782).
- **H7 rollout**: bàn giao chỉ mở cho module đã bật config + sau khi record cũ có edit-grant (Phase 5).

## Related Code Files
- Modify: `src/modules/data-access/data-access.service.ts` (+`handover` nếu chọn (b))
- Modify: `src/modules/data-access/data-access.controller.ts` (route mỏng nếu (b))
- Create: `src/modules/data-access/dto/handover-data-access.dto.ts` (nếu (b))
- Reference: `creator-access-grant.service.ts` (RUD action set), `permission-cache.service.ts` (invalidate)
- Test: `data-access-handover.service.spec.ts`

## TDD — Tests First
1. **handover spec** (đỏ):
   - A (manage được) bàn giao 5 report cho B → B có edit(RUD), A không còn (getAccessibleRecords A rỗng cho record đó; B đủ).
   - caller không manage được 1 record → 403, rollback tất cả (all-or-nothing).
   - super_admin/SO bàn giao hộ → OK.
   - handover cho user inactive / cho chính A → reject.
   - rule A cấp cho user C trên record → **vẫn còn** sau handover (chỉ chuyển edit của A).
   - cache invalidate A, B, và invalidateByTable sau commit.

## Implementation Steps
1. Viết spec (đỏ).
2. Tạo `HandoverDataAccessDto` + route mỏng trên `data-access.controller.ts`.
3. Cài `handover` (1 transaction move RUD A→B, giữ rule bên thứ 3) + auth `canManageRecord` OR super_admin/SO.
4. Invalidate A/B/table sau commit + history log.
5. Specs xanh.

## Success Criteria
- [ ] Bàn giao chuyển edit A→B nguyên tử; A mất, B nhận (AC #3).
- [ ] Auth manage-or-admin đúng; all-or-nothing.
- [ ] Cache invalidate đủ (A, B, table).

## Risk Assessment
- **Atomicity** → toàn bộ move trong 1 transaction; rollback trọn nếu 1 dataId fail auth.
- **Multi-editor**: record có thể nhiều editor (theo quyết định "manage=editor") — handover chỉ chuyển edit của A cụ thể, editor khác giữ nguyên. Ghi rõ trong spec.
- **Cache** → invalidate A/B/table sau commit.
