---
phase: 1
title: Permission Codes Foundation
status: completed
priority: P1
effort: 3h
dependencies: []
---

# Phase 1: Permission Codes Foundation (ADD-ONLY)

## Overview
**Chỉ THÊM 4 code mới**, giữ nguyên 6 code cũ (43–48) còn sống. Xóa code cũ dời sang phase 6 (sau khi mọi consumer đã re-gate) để tránh cửa sổ 403 runtime. Đây là nền cho phase 2–4 reference code mới.

> Red-team fix (G): KHÔNG xóa code ở phase 1. Delete migration chạy CUỐI CÙNG (phase 6), sau khi controller/service không còn tham chiếu code cũ.
> Red-team fix (B): seeder INSERT-ONLY (`permission.seeder.ts:350-351` filter `!existingIds` rồi return) → sửa mảng seeder KHÔNG reseed row đã tồn tại. **Migration là đường DUY NHẤT** thêm code mới (upsert), không dựa vào seeder ở prod.

Rollout path đã được ghi trong `reports/rollout-checklist.md`; deploy dùng add-migration + manual re-grant, không đợi seed re-run cho prod.

## Requirements
- Functional: 4 code mới tồn tại DB: `bp_program_upload`(49), `bp_program_upload_recon`(52), `bp_program_approve`(53), `bp_program_confirm`(54), module_id=13. Code cũ 43–48 vẫn còn (xóa ở phase 6).
- Non-functional: migration idempotent (upsert), có down (xóa 4 code mới).

## Architecture
Id 49/52/53/54 đã verify TRỐNG (`permission.seeder.ts:299-305` nhảy 48→50; 49,52,53 chưa dùng). Template 50/51 giữ.

Seeder chỉ insert khi id chưa tồn tại → thêm 4 item vào `BI_PAYMENT_PROGRAM` cho môi trường seed-mới, NHƯNG prod (DB đã có) phải dùng migration upsert vì seeder bỏ qua. Xác nhận deploy chạy `seed` (insert-only, `package.json:28`) hay `seed:refresh` (`:29`) — nếu `seed` thì migration bắt buộc.

## Related Code Files
- Modify: `src/seeders/permission.seeder.ts` — thêm 4 item mới vào `BI_PAYMENT_PROGRAM` (10 items tạm thời: 4 cũ giữ + 6 cũ giữ + 4 mới = KHÔNG, chính xác: 10 code cũ hiện có → giữ + thêm 4 = 14 tạm; phase 6 xóa 6 → còn 8). Cập nhật comment count.
- Create: `src/migration/<ts>-add-bi-payment-program-permissions.ts` — INSERT (upsert ON CONFLICT id) 4 code mới; down = DELETE 4 code mới.

## Implementation Steps
1. Thêm 4 item vào `BI_PAYMENT_PROGRAM`:
   ```ts
   { id: 49, code: 'bp_program_upload', name: 'Upload', method: 'POST', action: 'upload', is_active: true, module_id: 13 },
   { id: 52, code: 'bp_program_upload_recon', name: 'Upload tra soát', method: 'POST', action: 'upload_recon', is_active: true, module_id: 13 },
   { id: 53, code: 'bp_program_approve', name: 'Approve', method: 'PATCH', action: 'approve', is_active: true, module_id: 13 },
   { id: 54, code: 'bp_program_confirm', name: 'Confirm', method: 'PATCH', action: 'confirm', is_active: true, module_id: 13 },
   ```
   (Giữ 39–48 nguyên ở phase này.)
2. Migration add: upsert 4 row (INSERT ... ON CONFLICT (id) DO UPDATE code/name/action) để idempotent trên DB đã seed. Down: `DELETE FROM permissions WHERE id IN (49,52,53,54)`.
3. Xác nhận id trống: grep `id: 49|id: 52|id: 53|id: 54` toàn seeder → chỉ 1 hit mỗi id (của mình).
4. Lập inventory call-site code cũ (input cho phase 3–4–6): grep TOÀN repo (không chỉ __tests__):
   `bp_program_next_step|bp_program_preparing|bp_program_calculating|bp_program_reconciliation_bicc|bp_program_reconciliation_sale|bp_program_confirm_release`
   → lưu `reports/old-code-callsites.md`. Phải bao gồm: program-step, document, checklist, template, **comment**, **other-file**, `document.service.getAccessibleProgramIds`, `template.service.STEP_CODES`.
5. Compile check `npx tsc --noEmit` + chạy migration up/down trên DB dev.

## Success Criteria
- [x] 4 code mới thêm được (id 49/52/53/54), code cũ 43–48 CÒN nguyên.
- [x] Migration add upsert idempotent + có down.
- [x] `reports/old-code-callsites.md` liệt kê ĐẦY ĐỦ call-site (bao gồm comment, other-file, 2 hardcoded array).
- [x] Rollout path captured in `reports/rollout-checklist.md` (add migration + manual re-grant + later cleanup order).
- [x] Repo-wide `npx tsc --noEmit` warning recorded; unrelated Role drift remains outside BI Payment scope.

## Risk Assessment
- Seeder insert-only → prod không nhận code mới nếu chỉ sửa seeder. Mitigation: migration upsert là source-of-truth (fix B).
- Bỏ sót call-site trong inventory → gate chết ở phase 6 khi xóa code. Mitigation: grep toàn repo, đối chiếu report.
