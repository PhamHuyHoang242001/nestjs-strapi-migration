---
phase: 4
title: "Document Own-Filter & Merge"
status: completed
priority: P1
effort: "8h"
dependencies: [1, 2, 3]
---

# Phase 4: Document Own-Filter & Merge

## Overview
Re-gate document controller + wire own-filter cho MỌI read path (không chỉ list), remap `getAccessibleProgramIds`, merge→upload, update-status→approve prepare-only + tách submit, gỡ @Delete doc. Phase rủi ro cao nhất (security).

This phase now covers the four workstep buckets in the doc paths: PREPARE, EX_PREPARE, RECON_DATA, RECON_FEEDBACK.

> Red-team fix (E/F7/F8): **IDOR** — `checkDocStep`/`assertDocStep` (`document.service.ts:528-541`) dùng flat Set → recon user tải doc recon người khác qua `GET /:id/download`. Own-filter PHẢI áp cả detail/download/stats/user-*, không chỉ list.
> Red-team fix (C/F2): `getAccessibleProgramIds` (`:489-499`) hardcode 5 code cũ → remap; feed `assertMergeInScope`(:364) + `distinctUsersByColumn`(:449).
> Red-team fix (J/F4-scope): `list()` (`:52-64`) KHÔNG có param DataScope, KHÔNG gọi applyDataScope trên doc table (chỉ `:507` trên PROGRAM_TABLE). Own-filter = **plain `uploaded_by_id=:userId` predicate**, BỎ ngôn ngữ applyDataScope-DENY.
> Red-team fix (F7-security correction): `assertDocStep` (`:284-302,528-532`) là assert generic dùng chung findOne/download/delete — KHÔNG có "nhánh delete". Chỉ gỡ `@Delete` route + `service.delete`, KHÔNG động `assertDocStep`.
> Decisions (user): update-status = approve CHỈ prepare (bỏ recon-feedback approval); submit tách cho uploader; Xem-only → empty 200; gỡ hẳn @Delete doc.

## Requirements
- Functional:
  - `list`/`findOne`/`download`/`stats`/`upload-status`/`user-*` gate OR = `[bp_program_view, bp_program_upload, bp_program_upload_recon]` (giữ view để Xem-only vào được rồi service trả empty).
  - Own-filter (`uploaded_by_id=self`) áp cho RECON_DATA khi user chỉ có `upload_recon` — ở list (SQL predicate) VÀ detail/download/stats/user-* (per-doc/aggregate).
  - Xem-only (không upload/approve) → service trả `{data:[], total:0}` (KHÔNG throw, KHÔNG 403) — dùng `resolveWorkstepScopesOrEmpty`.
  - `upload` gate `[upload, upload_recon]`; recon-only chỉ upload RECON_DATA; set `uploaded_by_id`.
  - `submit` (update-status status=submit) → gate `[upload, upload_recon]` (uploader tự submit doc mình); enforce trong service.
  - `approve/reject` (update-status status=approval|rejected) → gate `bp_program_approve`, chỉ áp doc PREPARE+EX_PREPARE (whitelist workstep trong service — hành vi này CHƯA tồn tại, phải THÊM, không phải verify).
  - `merge-file`/`get-merged-status`/`download-merged-reconciliation` → gate `bp_program_upload`.
  - Gỡ hẳn `@Delete(':id')` route + `service.delete`.
- Non-functional: own-filter ở SQL cho list/aggregate; per-doc cho detail.

## Architecture
`resolveWorkstepScopes(userId, programId)` (phase 2) trả Map<ws,{own}>.
- list (`:67`): `template.workstep_type IN (map.keys())` + với ws own:true thêm `(workstep_type != 'RECON_DATA' OR d.uploaded_by_id = :userId)`.
- stats (`:188`): áp cùng own predicate trên aggregate (không đếm doc người khác).
- checkDocStep/assertDocStep (`:528-541`): chuyển sang `resolveWorkstepScopes`; nếu doc.workstep own:true & `doc.uploaded_by_id !== userId` → deny.
- distinctUsersByColumn / user-* (`:441-483`): cross-program → dùng `resolveGlobalViewableWorksteps` + nếu chỉ upload_recon thì lọc `uploaded_by_id=self` (chỉ enumerate chính mình cho recon).
- getAccessibleProgramIds (`:489-499`): thay 5 code cũ bằng codes cấp program-access mới. "Program access" = union `getAccessibleRecords` của [view, upload, upload_recon, approve, confirm] (quyết: bất kỳ code nào có tại program = accessible).
- updateStatus (`:375-417`): thêm whitelist `workstep IN (PREPARE, EX_PREPARE)` cho nhánh approval/rejected; submit tách gate.

## Related Code Files
- Modify: `bi-payment-document.controller.ts` (decorators; xóa @Delete)
- Modify: `bi-payment-document.service.ts` (own-filter list+stats+checkDocStep+user-*; getAccessibleProgramIds remap; updateStatus whitelist+submit; xóa delete)

## Implementation Steps
1. Controller: OR-gate read endpoints thêm `bp_program_view`; upload→[upload,upload_recon]; merge→upload; update-status split (approve vs submit — có thể tách 2 route hoặc 1 route gate union rồi enforce service). Xóa `@Delete(':id')` + import thừa.
2. Service list + stats: own predicate SQL.
3. Service checkDocStep/assertDocStep: dùng Map, per-doc own check (fix IDOR).
4. Service upload: assert workstep-scope; recon-only→RECON_DATA; set uploaded_by_id.
5. Service updateStatus: whitelist prepare cho approve/reject; submit path cho uploader.
6. Service getAccessibleProgramIds: remap union 8-code.
7. Service user-*: own-filter recon.
8. Xóa `service.delete` (giữ `assertDocStep`).
9. **Grep-gate** `src/`: 0 hit 6 code cũ (chỉ còn legacy const dọn phase 6). `npx tsc --noEmit` pass sạch.

## Success Criteria
- [x] recon-only user: list + detail + download + stats + user-* CHỈ ra recon doc của mình; cross-user recon doc → 403/không xuất hiện (test IDOR).
- [x] upload-full: thấy mọi doc across PREPARE/EX_PREPARE/RECON_DATA/RECON_FEEDBACK; merge/merged OK.
- [x] Xem-only: doc list `{data:[],total:0}` 200 (không throw/403); template list rỗng.
- [x] approve: chỉ set status doc PREPARE/EX_PREPARE; recon-feedback approve → chặn.
- [x] submit: uploader submit doc mình OK không cần approve.
- [x] getAccessibleProgramIds trả đúng theo code mới (merge/user-* không rỗng oan).
- [x] @Delete doc gỡ (404 route); assertDocStep còn nguyên.
- [x] Grep-gate 0 hit; repo-wide `tsc` warning recorded, unrelated Role drift remains outside BI Payment scope.

## Risk Assessment
- IDOR qua detail/download là lỗ nguy hiểm nhất — test cross-user bắt buộc (phase 5).
- updateStatus split submit/approve dễ deadlock nếu quên submit path (fix F4-assumption). Test submit→approve E2E-lite.
- getAccessibleProgramIds "union 8-code" có thể quá rộng — verify không cấp merge cho approve-only. Cân nhắc chỉ [upload] cho merge-scope.
- Own predicate phải param hóa (`:userId`) — tránh injection.
