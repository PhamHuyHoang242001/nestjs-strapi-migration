# Old-Code Call-Site Inventory (Phase 1 output)

Grep `bp_program_{next_step,preparing,calculating,reconciliation_bicc,reconciliation_sale,confirm_release}` across `src` (non-test). Input cho phase 3/4/6. Comment/entity-doc lines = harmless (dọn tuỳ ý).

## Runtime gates (MUST re-gate before delete migration)

| File | Lines | Old code(s) | New gate (phase) |
|------|-------|-------------|------------------|
| `program/bi-payment-program-step.controller.ts` | 41-42 | next_step | edit (P3) |
| | 50-51 | preparing | edit (P3) |
| | 58-59 | calculating | edit (P3) |
| | 66-67 | reconciliation_bicc | edit (P3) |
| | 74-75, 83-84 | confirm_release | edit (waiting-workstep) / confirm (pic-confirm) (P3) |
| `checklist/bi-payment-checklist.controller.ts` | 29-30,38-39,48-49,58-59 | preparing | upload (P3) |
| | 67-68 | preparing (approval) | approve (P3) |
| `comment/bi-payment-comment.controller.ts` | 30, 39 | preparing+recon_bicc+recon_sale | upload (P3) |
| `other-file/bi-payment-other-file.controller.ts` | 31-32,40-41,50-51,68-69,78-79 | preparing | upload (P3) |
| `template/bi-payment-template.controller.ts` | 31-35 (TEMPLATE_VIEW_PERMS) | 5 codes | [upload, upload_recon] (P3) |
| `template/bi-payment-template.service.ts` | 38-42 (STEP_CODES) | 5 codes | new codes for user-* (P3) |
| `document/bi-payment-document.controller.ts` | 46-50,70-74,85-89 | 5 codes (read) | [view,upload,upload_recon] (P4) |
| | 100-104 (upload) | 5 codes | [upload,upload_recon] (P4) |
| | 114 (delete) | preparing/recon_bicc/confirm_release | **route removed** (P4) |
| | 124 (update-status) | preparing+recon_bicc | approve / submit split (P4) |
| | 133,145,154 (merge/merged) | confirm_release | upload (P4) |
| `document/bi-payment-document.service.ts` | 490-494 (getAccessibleProgramIds) | 5 codes | remap union new codes (P4) |
| `common/step-scope.constants.ts` | 7-10, 23 (WORKSTEP_TYPE_PERM, bonus) | legacy | replaced by WORKSTEP_VIEW_CODES; dọn (P2/P6) |

## Comment/doc-only (non-gate; dọn tuỳ ý)
- `checklist/*.service.ts:14`, `other-file/*.service.ts:14`, `program/bi-payment-program.service.ts:152`, `program/constants/workstep-transition.ts:3`, `databases/bi-payment-template.entity.ts:14-15`, `seeders/permission.seeder.ts:281`.

## Seeder rows to delete (phase 6)
`permission.seeder.ts:294-299` — ids 43,44,45,46,47,48.

## Verified
- comment gates on 3 codes (not just preparing) — re-gate all → upload.
- document delete (line 114) → route removed (business decision).
- No hits in report/history/category modules (use bp_program_view/bp_project_view — untouched).
