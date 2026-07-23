---
phase: 6
title: "Cleanup, Docs & Rollout"
status: in-progress
priority: P1
effort: "4h"
dependencies: [1, 2, 3, 4, 5]
---

# Phase 6: Cleanup, Docs & Rollout

## Overview
Chuẩn bị cleanup migration code cũ ở trạng thái deferred, dọn legacy runtime constants, cập nhật docs/runbook, chốt thủ tục reset (admin gán tay), và đóng plan cũ 260708. Chỉ kích hoạt/chạy cleanup sau khi manual re-grant + smoke với code mới đã đạt trên môi trường đích.

Doc-side artifacts updated; live DB delete migration, cache flush, manual grants, and deferred cleanup activation remain outstanding.

> Red-team fix (G): delete code cũ ở đây (KHÔNG ở phase 1) → không có cửa sổ 403.
> Red-team fix (A): cleanup migration phát hiện động `permissions`/`permission` và `role_permissions`/`roles_permissions`. Chỉ `data_access_users` có `permission_id`; `data_access` và `data_access_roles` không permission-scoped nên không được xóa bằng `permission_id`.
> Red-team fix (H): reseed/delete KHÔNG tự invalidate Redis cache (`permission-cache.service.ts:52-68`; grep seeders/migration `invalidate`=0) → PHẢI flush thủ công.
> Red-team fix (M/F8-scope): cắt 4 sample-role seed (mâu thuẫn "admin gán tay") → chỉ cung cấp SQL snippet trong rollout doc.
> Red-team fix (F9-scope): đóng plan 260708 UP-FRONT (không mô hình blockedBy) — quan hệ là superseded, không phải blocking.

## Requirements
- Functional: 6 code cũ (43–48) + references bị xóa sạch; cache flush; doc khớp 8 code.
- Non-functional: migration up/down verify; before/after count assert; không secret commit.

## Related Code Files
- Create: `src/deferred-migrations/1784804400000-remove-legacy-bi-payment-program-permissions.ts` (ngoài active ORM glob tới đợt cleanup sau)
- Modify: `src/seeders/permission.seeder.ts` (bỏ 6 item cũ khỏi `BI_PAYMENT_PROGRAM` → còn 8), dọn legacy const (`WORKSTEP_TYPE_PERM`/`viewCodesForWorkstep`/`WORKSTEP_BONUS_VIEW_BY_CODE` nếu hết consumer)
- Modify: `AUTHORIZATION_SYSTEM_VI.md`, `docs/*` liên quan
- Modify: `plans/260708-1550-bi-payment-step-scoped-permission/plan.md` (`status: cancelled`)

## Implementation Steps
1. Xác nhận grep-gate (phase 3+4) = 0 hit code cũ trong luồng runtime; legacy const đã hết consumer.
2. Dọn legacy const trong `step-scope.constants.ts` (`WORKSTEP_TYPE_PERM`, `viewCodesForWorkstep`, `WORKSTEP_BONUS_VIEW_BY_CODE`) + re-export ở document/template service. Cập nhật test legacy.
3. Viết deferred cleanup migration, verify qua entity trước:
   ```sql
   DELETE FROM {{role_permissions_or_roles_permissions}} WHERE permission_id IN (43,44,45,46,47,48);
   DELETE FROM data_access_users WHERE permission_id IN (43,44,45,46,47,48);
   -- data_access/data_access_roles không có permission_id, giữ nguyên.
   DELETE FROM {{permissions_or_permission}} WHERE id IN (43,44,45,46,47,48) AND module_id = 13;
   ```
   Fail closed khi schema ambiguous hoặc id thuộc module khác. Down = re-insert 6 definition cũ; assignment cũ phải re-grant tay. Giữ file ngoài `src/migration/` tới khi manual grant + smoke đạt.
4. Cache flush: thêm bước ops (flush Redis permission cache) hoặc gọi `invalidateAll` sau migration+reseed. Ghi vào rollout-checklist.
5. Bỏ 6 item cũ khỏi seeder `BI_PAYMENT_PROGRAM` (còn 8), cập nhật comment count.
6. Cập nhật `AUTHORIZATION_SYSTEM_VI.md`: ma trận 8 code, mapping workstep→code mới, own-only recon, bỏ bonus-view, gỡ delete doc, comment/other-file→upload.
7. Viết `reports/rollout-checklist.md`: add-code migration + deploy code → admin gán code mới khi legacy còn tồn tại → **flush cache** → smoke → đợt sau kích hoạt cleanup migration → flush cache → smoke lại. Rollback nêu rõ assignment phải re-grant tay. SQL snippet role mẫu (tùy ops, KHÔNG seed).
8. Đóng plan 260708 (`status: cancelled` + note superseded bởi plan này).

## Success Criteria
- [ ] Deferred cleanup migration đúng tên bảng, có collision/assert guard + down; chạy up/down trên DB đích OK.
- [x] Runtime không còn 6 code cũ; chỉ deferred rollback SQL giữ definition; seeder còn 8 code; legacy const đã dọn.
- [x] Cache flush trong rollout-checklist (bắt buộc bước).
- [x] `AUTHORIZATION_SYSTEM_VI.md` khớp 8 code (grep chéo); không nhắc bonus-view/delete-doc/code cũ.
- [x] `rollout-checklist.md` có deploy order (add trước, delete sau, flush cache) + rollback + SQL role snippet.
- [x] Plan 260708 cancelled + cross-ref.
- [ ] `npm test` vẫn xanh sau dọn legacy.

## Risk Assessment
- Reset assignment = downtime quyền tới khi admin gán lại → rollout nhấn mạnh làm ngoài giờ, có SQL snippet sẵn.
- Quên flush cache → user stale scope tới TTL (heisenbug). Mitigation: flush là success-criteria bắt buộc.
- Xóa nhầm permission module khác → fail closed nếu id 43–48 không thuộc module 13; delete definition luôn giới hạn `module_id = 13`.
- Down migration phải re-insert đúng code cũ để rollback thật sự khả thi.
