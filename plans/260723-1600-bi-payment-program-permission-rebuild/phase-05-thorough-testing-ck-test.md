---
phase: 5
title: "Thorough Testing (ck:test)"
status: in-progress
priority: P1
effort: "10h"
dependencies: [1, 2, 3, 4]
---

# Phase 5: Thorough Testing (ck:test)

## Overview
Phase kiểm thử trọng tâm. Cập nhật specs cũ, viết matrix 8 quyền × endpoint, đặc biệt bao case security IDOR own-only recon ở MỌI read path. Chạy `/ck:test` toàn suite tới PASS + coverage. KHÔNG mock giả để pass.

Scoped verification done: 20 suites / 174 tests passed in BI Payment scope, 65/69 full repo suites and 602/604 tests passed, coverage reporter unusable, and test-summary report written.

> Red-team: các lỗ nằm NGOÀI list-path (detail/download IDOR, stats count leak, user-* PII, cross-program user-*, SO per-program, template create coupling, comment/other-file gates) — test phải phủ hết, không chỉ list.

## Existing Specs Phải Cập Nhật
- `common/__tests__/step-scope.service.spec.ts` — bonus-view removed; `resolveWorkstepScopes` own-map; SO per-program.
- `document/__tests__/workstep-type-perm.spec.ts` — nếu giữ WORKSTEP_TYPE_PERM legacy thì test cũ còn đúng tới phase 6; thêm test `WORKSTEP_VIEW_CODES`.
- `document/__tests__/bi-payment-document.service.step-scope.spec.ts` — own-filter list + detail/download IDOR + delete removed.
- `program/__tests__/workstep-transition.spec.ts` — next_step gate→edit.
- `program/__tests__/bi-payment-program-create-authz.spec.ts` — verify vẫn xanh.
- Grep `bp_program_preparing|calculating|reconciliation|confirm_release|next_step` trong TẤT CẢ `__tests__` → sửa hết.

## Test Matrix (mỗi ô ≥1 allow + ≥1 deny)
| Quyền | Allow | Deny |
|-------|-------|------|
| Xem | list/detail program+step; doc list `{data:[],total:0}` 200; template list rỗng | KHÔNG rò 1 record nào |
| Tạo mới | POST program | thiếu→403 |
| Sửa | PUT + 5 `*-workstep` + next-step | thiếu edit→403 |
| Xóa | DELETE program | thiếu→403 |
| Upload | upload+list mọi doc ở 4 workstep PREPARE/EX_PREPARE/RECON_DATA/RECON_FEEDBACK của mọi người; merge/merged; template full; comment/other-file/checklist CRUD | không tự approve (approval 403 nếu chỉ upload) |
| Upload tra soát | upload RECON_DATA; list/detail/download/stats/user-* CHỈ recon doc của mình; recon template full-view | KHÔNG thấy recon doc người khác (list+detail+download+stats+user-*); PREPARE/FEEDBACK doc ẩn; upload PREPARE→403; merge→403 |
| Approve | approval/rejected doc PREPARE+EX_PREPARE; checklist approval | approve recon-feedback doc→chặn; không upload |
| Confirm | pic-confirm-final-link | không cấp view doc; các `*-workstep`→không cần confirm |
| SO owner | own-all mọi doc mọi loại; bypass own-filter (per-program) | soft-deleted program không lọt; SO-of-A KHÔNG own-all ở B |

## Security-Critical Cases (bắt buộc)
- [x] user A (upload_recon) upload recon doc; user B (upload_recon) list/**detail (`GET /:id`)**/**download (`/:id/download`)**/**stats** → KHÔNG thấy/403 doc của A (IDOR — fix E/F8).
- [x] upload_recon KHÔNG thấy RECON_FEEDBACK / PREPARE doc.
- [x] bonus-view removed: bicc-role cũ (nay upload) không có đường tắt.
- [x] SO-of-A + upload_recon-on-B: tại B chỉ own recon; SO-of-A thấy full ở A (per-program — fix L).
- [x] Xem-only → doc `{data:[],total:0}`, template rỗng, 0 record (fix Xem-only-contract).
- [x] cross-program `user-created/updated/approved/rejected`: recon-only user chỉ enumerate chính mình (không PII người khác — fix F).
- [ ] `getAccessibleProgramIds` remap: approver "docs I approved" KHÔNG rỗng oan (fix C/F5).
- [x] checklist list + other-file search: view-only raw `[]`; upload-capable / owner / admin sees content (fix Xem-only-contract for these paths).
- [ ] comment (2) endpoint: upload user OK; non-upload 403 (fix D/F1).
- [x] template create: `bp_template_create`-only user tạo được (KHÔNG 403 do view-map — fix K).
- [x] submit vs approve: uploader submit doc mình OK; approve-only không upload; approve chỉ prepare (fix F4/F6).
- [x] @Delete doc → 404 route.

## Implementation Steps
1. Grep + sửa mọi spec reference code cũ (suite compile).
2. Unit test `resolveWorkstepScopes` (own flag + SO per-program) — nền own-filter.
3. Mở rộng document step-scope spec: own-filter list + **detail/download IDOR** + stats count + user-* cross-program + Xem-only empty.
4. Test checklist/comment/other-file gate (→upload); template view + create-decouple.
5. `/ck:test` toàn suite → đọc report → fix root cause (không cheat) → lặp tới xanh.
6. `npm run test:cov` → coverage file đã sửa không giảm; bổ sung test nếu thủng.
7. Report `reports/test-summary.md`.

## Success Criteria
- [ ] `npm test` toàn bộ PASS (0 fail, không skip mờ ám).
- [ ] Mọi ô matrix + các security case liệt kê ở trên có test xanh.
- [ ] Coverage `step-scope.service.ts`, `bi-payment-document.service.ts`, `template.service.ts`, checklist/comment/other-file không giảm.
- [ ] Không spec nào còn reference code cũ (trừ test legacy-const chờ phase 6).
- [x] `reports/test-summary.md` đầy đủ.

## Risk Assessment
- Own-filter test dễ pass sai nếu seed 1 user → seed ≥2 user upload_recon khác nhau + doc chéo.
- IDOR test phải gọi detail+download riêng (không chỉ list) — đây là lỗ reviewer nhấn mạnh.
- Suite lớn timeout 60s → ưu tiên unit-level (mock repo/qb) cho own-filter; reuse `common/authorization/__tests__/test-utils`.
