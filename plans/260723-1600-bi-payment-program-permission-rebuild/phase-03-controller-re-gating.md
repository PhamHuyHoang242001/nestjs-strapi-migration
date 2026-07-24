---
phase: 3
title: Controller Re-Gating
status: completed
priority: P1
effort: 6h
dependencies:
  - 1
  - 2
---

# Phase 3: Controller Re-Gating

## Overview
Đổi gate sang code mới trên: program-step, program, checklist, template, **comment**, **other-file**. Checklist list và other-file search giữ coarse view/upload access: view-only trả raw `[]`, write/download vẫn upload-gated. Document controller + own-filter → phase 4.

Scoped controller re-gating is in place; repo-wide `tsc` drift is unrelated and already recorded in the plan note.

> Red-team fix (D): comment vẫn upload-gated; checklist list + other-file search là ngoại lệ coarse view/upload (view-only raw `[]`). Giữ note này để tránh quay lại hiểu nhầm “mọi endpoint đều upload-only”.
> Red-team fix (C-template): `template.service.STEP_CODES` (`template.service.ts:36-43`) hardcode 5 code cũ, feed user-created/updated → remap.
> Red-team fix (K): template CREATE gọi `assertWorkstep` (`template.service.ts:369`, dup :212) → dùng view-map. Sau phase 2 map = upload codes → user `bp_template_create`-only sẽ 403. Phải decouple.
> Red-team fix (G/F2-scope): `tsc` KHÔNG bắt được code-literal sai (`require-permission.decorator.ts:4` nhận `...string[]`). Exit = **grep-gate** = 0 hit code cũ (ngoài comment), KHÔNG dựa tsc.

## Mapping (verified)
**`bi-payment-program-step.controller.ts`:**
- `next-step/:id`, `preparing-workstep/:id`, `calculating-workstep/:id`, `reconciliation-workstep/:id`, `waiting-for-approval-workstep/:id` → **`bp_program_edit`**
- `pic-confirm-final-link` → **`bp_program_confirm`**
- (fix F10) verify `waiting-for-approval-workstep` handler (`service.updateCalculating`) chỉ sửa metadata, KHÔNG gây state-transition confirm-class; nếu có → tách.

**`bi-payment-program.controller.ts`:** giữ nguyên (view/create/edit/delete).

**`bi-payment-checklist.controller.ts`:** `list` → coarse **`['bp_program_view','bp_program_upload']`**; view-only trả raw `[]`. `create/update/delete` → **`bp_program_upload`**; `approval` → **`bp_program_approve`**.

**`bi-payment-comment.controller.ts`** (`:30,39`): mọi endpoint → **`bp_program_upload`** (quyết định user: comment coi như thao tác nội dung).

**`bi-payment-other-file.controller.ts`** (`:31,41,51,69,79`): `search` → coarse **`['bp_program_view','bp_program_upload']`**; view-only trả raw `[]`. `user-created` / `download-multiple` / `upload` / `delete` → **`bp_program_upload`** (attachment = file op; đồng bộ checklist).

**`bi-payment-template.controller.ts`:**
- `TEMPLATE_VIEW_PERMS` (list/detail/download/user-created/user-updated) → **`['bp_program_upload','bp_program_upload_recon']`**
- `create`/`duplicate-many` (`bp_template_create`) + `delete`/`delete-many` (`bp_template_delete`) → **giữ code**, NHƯNG decouple `assertWorkstep` (fix K).
- `template.service.STEP_CODES` → remap sang code mới (upload/upload_recon) cho user-* path.

## Related Code Files
- Modify: program-step, checklist, comment, other-file controllers
- Modify: `bi-payment-template.controller.ts` (`TEMPLATE_VIEW_PERMS`) + `bi-payment-template.service.ts` (`STEP_CODES`, `assertWorkstep` coupling ở create :212/:369)
- Verify (no change): `bi-payment-program.controller.ts`
- Note: report/history/category dùng `bp_program_view`/`bp_project_view` → KHÔNG đụng (verified).

## Implementation Steps
1. program-step: 5×edit + 1×confirm; verify handler waiting-for-approval (fix F10).
2. checklist: list → coarse view/upload; create/update/delete → upload; approval→approve (giữ userId param).
3. comment: đổi decorator → upload (2 endpoint). other-file: search → coarse view/upload; user-created/download/upload/delete → upload (5 endpoint).
4. template controller: `TEMPLATE_VIEW_PERMS` → 2 upload code.
5. template.service:
   - `STEP_CODES` → code mới.
   - create/duplicate (`assertWorkstep` :212,:369): decouple — create template KHÔNG gate qua view-map; chỉ cần `bp_template_create` (verb) + data_access program. Bỏ `assertWorkstep` khỏi create hoặc thay bằng check program-scope không phụ thuộc workstep-view.
   - Recon template full-view cho `upload_recon` (KHÔNG own-filter template — verified `template.service.ts:84-96` chỉ lọc workstep).
6. **Grep-gate**: grep toàn `src/` (ngoài comment code & test) cho 6 code cũ → mọi hit còn lại phải là document.service (phase 4) hoặc legacy const chờ phase 6. Ghi diff vào report.
7. Compile `npx tsc --noEmit`.

## Success Criteria
- [x] program-step 5×edit + confirm; waiting-handler verified metadata-only.
- [x] checklist list → coarse view/upload empty-200; create/update/delete→upload, approval→approve.
- [x] other-file search → coarse view/upload empty-200; user-created/download/upload/delete→upload.
- [x] comment (2) endpoint → upload; KHÔNG còn gate code cũ.
- [x] template view→[upload,upload_recon]; create/delete giữ code; `assertWorkstep` decoupled (create-only user KHÔNG 403); `STEP_CODES` remap.
- [x] Grep-gate: 0 hit code cũ ngoài document.service + legacy const (phase 4/6).
- [x] Repo-wide `tsc` warning recorded; unrelated Role drift remains outside BI Payment scope.

## Risk Assessment
- Template create decouple sai → hoặc create-only user vẫn 403, hoặc mất data_access check. Đọc kỹ `template.service.ts:200-230,360-380` trước sửa.
- other-file là subtree checklist (fix F9) — gate lockstep với checklist (cùng upload) để tránh tạo-checklist-OK-nhưng-attach-403.
- Grep-gate là net thật (tsc là net giả) — bắt buộc chạy.
