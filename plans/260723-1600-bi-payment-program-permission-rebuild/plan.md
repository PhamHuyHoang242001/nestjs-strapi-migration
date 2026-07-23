---
title: Bi-Payment Program Permission Matrix Rebuild (8-code model)
description: >-
  Rebuild bi-payment program authorization from 10 step-scoped codes to an
  8-permission matrix: view/create/edit/delete + upload (full) + upload_recon
  (own-only) + approve + confirm. Fold next_step/calculating into edit;
  pic-confirm-final-link = confirm; merge artifacts under upload; drop bonus-view;
  remove doc delete; reset & manual re-grant.
status: in-progress
priority: P1
branch: main
tags:
  - permission
  - data-access
  - bi-payment
  - program
  - authorization
blockedBy: []
blocks: []
supersedes:
  - 260708-1550-bi-payment-step-scoped-permission
created: '2026-07-23T03:24:15.820Z'
createdBy: 'ck:plan'
source: skill
---

# Bi-Payment Program Permission Matrix Rebuild (8-code model)

## Overview

Thay bộ 10 code step-scoped hiện tại của program bằng ma trận 8 quyền nghiệp-vụ. `Xem` là base gate BE (doc/template list rỗng nếu không kèm upload/approve/confirm). `Sửa` hấp thụ next_step + calculating + mọi `*-workstep` metadata. Upload full = xem+upload mọi template & doc (PREPARE/EX_PREPARE/RECON_DATA/RECON_FEEDBACK) + merge artifacts. Upload tra soát = recon template (full-view) + doc RECON_DATA **do chính mình tạo**. Approve = duyệt prepare-doc + checklist. Confirm = `pic-confirm-final-link` (chốt cuối). Bỏ bonus-view. Gỡ endpoint delete doc. Reset assignment cũ → admin gán tay.

Nguồn: brainstorm session 2026-07-23 (8 câu hỏi đã chốt). Kế thừa StepScopeService/`applyDataScope`/SO own-all từ plan `260708-1550`.

Known exceptions: repo-wide `tsc --noEmit` still reports unrelated Role property drift outside BI Payment scope; phase completion in this plan tracks verified BI Payment scope and the explicit rollout docs, not those unrelated errors. Live DB rollout / cache flush remain phase 6 items, not phase 1-4 claims.

## Ma trận (module_id=13)

| Code | Tên | Gate |
|------|-----|------|
| `bp_program_view` (giữ 39) | Xem | list/detail program + step metadata; base gate |
| `bp_program_create` (giữ 40) | Tạo mới | POST program |
| `bp_program_edit` (giữ 41) | Sửa | PUT program + `*-workstep/:id` + `next-step` (hấp thụ next_step, calculating) |
| `bp_program_delete` (giữ 42) | Xóa | DELETE program |
| `bp_program_upload` (mới) | Upload | view+upload toàn bộ template + doc (PREPARE/EX_PREPARE/RECON_DATA/RECON_FEEDBACK, mọi người) + merge artifacts |
| `bp_program_upload_recon` (mới) | Upload tra soát | view+upload recon template (full) + doc RECON_DATA own-only (`uploaded_by_id=self`) |
| `bp_program_approve` (mới) | Approve | doc `update-status` (prepare) + checklist `approval` |
| `bp_program_confirm` (mới) | Confirm | `pic-confirm-final-link` |

Gỡ: `next_step`(43), `preparing`(44), `calculating`(45), `reconciliation_bicc`(46), `reconciliation_sale`(47), `confirm_release`(48). Template `create`(50)/`delete`(51) giữ nguyên.

## Phases

| Phase | Name | Status | Progress |
|-------|------|--------|----------|
| 1 | [Permission Codes Foundation](./phase-01-permission-codes-foundation.md) | Completed | 5/5 |
| 2 | [Step-Scope Core Rewrite](./phase-02-step-scope-core-rewrite.md) | Completed | 5/5 |
| 3 | [Controller Re-Gating](./phase-03-controller-re-gating.md) | Completed | 6/6 |
| 4 | [Document Own-Filter & Merge](./phase-04-document-own-filter-merge.md) | Completed | 8/8 |
| 5 | [Thorough Testing (ck:test)](./phase-05-thorough-testing-ck-test.md) | In Progress | 10/16 |
| 6 | [Cleanup, Docs & Rollout](./phase-06-docs-rollout.md) | In Progress | 5/7 |

## Decisions (chốt — brainstorm + red-team)

- Full rebuild, reset assignment, admin gán tay lại — KHÔNG auto-map.
- **Phase order (red-team G):** phase 1 chỉ THÊM 4 code mới; XÓA code cũ ở phase 6 (sau khi mọi consumer re-gate + test xanh) → không có cửa sổ 403.
- `Xem` = base gate: giữ `bp_program_view` trong OR-gate doc/template; Xem-only → service trả **`{data:[],total:0}` 200** (không throw/403).
- next_step + 5 `*-workstep` metadata → `Sửa`. `pic-confirm-final-link` → `Confirm`. Merge artifacts → `Upload` full.
- Upload tra soát own-only áp cho DOC RECON_DATA ở MỌI read path (list + detail + download + stats + user-*), KHÔNG áp cho template.
- Bỏ bonus-view. Gỡ hẳn endpoint delete doc (FE xác nhận không dùng).
- Template create/delete giữ code (50/51) nhưng **decouple `assertWorkstep`** (red-team K).

## Decisions (business — chốt từ red-team round)

1. **comment + other-file** (bị bỏ sót) → gate `bp_program_upload`.
2. **update-status**: `approve/reject` chỉ áp doc PREPARE+EX_PREPARE (bỏ recon-feedback approval — regression có chủ đích); `submit` tách cho uploader (`upload`/`upload_recon`).
3. **Xem-only** → empty 200 (giữ view trong gate + service không throw).
4. **@Delete doc** → gỡ hẳn (FE không dùng).

## Không đổi (verified, KHÔNG do red-team lật)

- Mapping workstep: RECON_DATA=sale=tra soát (own_recon), RECON_FEEDBACK=bicc=feedback (`step-scope.constants.ts:8-9`) — plan đúng, chỉ thêm note rõ.
- Id mới 49/52/53/54 trống (verified). `uploaded_by_id` là cột creator (verified).

## Dependencies

- **Supersedes** `260708-1550-bi-payment-step-scoped-permission` (pending) — rebuild thay `WORKSTEP_TYPE_PERM` mà plan đó dựa vào. Đóng plan cũ (`cancelled`) ở phase 6, KHÔNG mô hình blocking edge (tránh auto-unblock mâu thuẫn — red-team M).
- Reuse (shipped): `isInOwnedScope` (per-program), PermissionGuard OR-semantics, `getAccessibleRecords` cache.
- **Lưu ý (red-team J):** doc `list()` KHÔNG có `applyDataScope` DENY (khác plan 260708 dự kiến) — own-filter = plain `uploaded_by_id` predicate.

## Red Team Review

### Session — 2026-07-23
**Reviewers:** 4 (Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic)
**Findings:** 13 dedup (12 accepted, 1 partial-reject) — all evidence-backed `file:line`.
**Severity:** 6 Critical, 5 High, 2 Medium.

| # | Finding | Severity | Disposition | Applied |
|---|---------|----------|-------------|---------|
| A | Migration wrong table names (`role_permissions`/`data_access_roles`/`data_access`) | Critical | Accept | P1→P6 |
| B | Seeder INSERT-ONLY (`:350-351`) → reseed no-op; migration = sole upsert | Critical | Accept | P1 |
| C | `getAccessibleProgramIds`(`:489-499`)+template `STEP_CODES`(`:36-43`) hardcode old codes | Critical | Accept | P3,P4 |
| D | comment+other-file controllers gate old codes, omitted | Critical | Accept | P3 |
| E | IDOR: `checkDocStep`/`assertDocStep` flat Set → recon download leak | Critical | Accept | P4 |
| F | stats/user-* own-blind count+PII leak | High | Accept | P4 |
| G | Delete-before-regate = 403 window; tsc false net → grep-gate + reorder | Critical | Accept | P1,P3,P4,P6 |
| H | No cache invalidation on reseed | High | Accept | P6 |
| I | Overloading `WORKSTEP_TYPE_PERM` breaks consumers → new `WORKSTEP_VIEW_CODES` | High | Accept | P2 |
| J | `list()` has no applyDataScope DENY; own-filter=plain predicate | High | Accept | P4 |
| K | Template create couples to `assertWorkstep` → create-only 403 | High | Accept | P3 |
| L | SO owner per-program not global | Medium | Accept | P2 |
| M | Cut sample-role seeds; fix superseded relationship | Medium | Accept | P6 |
| — | "Inverted mapping" (Security F3) | Critical | Partial-reject | note only (map correct) |

### Whole-Plan Consistency Sweep
Re-đọc plan.md + 6 phase sau khi áp finding: đồng bộ (a) phase order add→delete, (b) own-filter mọi read path, (c) grep-gate thay tsc-gate ở P3/P4, (d) comment/other-file + 2 hardcoded array vào scope, (e) supersedes thay blocking edge. **0 mâu thuẫn tồn đọng.** Business decisions (comment→upload, approve prepare-only+submit split, Xem-empty-200, delete-doc removed) áp nhất quán qua matrix + phase 3/4/5.
