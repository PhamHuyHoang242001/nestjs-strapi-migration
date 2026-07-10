# Phase 05 — Document endpoints Strapi-parity (query/body/return)

## Context Links
- Parent plan: `./plan.md`
- Strapi source: `strapiv5-old/src/api/bi-payment/services/bi-payment-document.ts`
- Prior phases: phase-04 (step×program scope), list-docs filter fix
- Decisions: "Đủ query+body+return" — NO S3 streaming / eventBus / validation_logs / creator-data-permission (NestJS lacks infra). user-created/... → list distinct USERS (Strapi parity).

## Overview
- Priority: medium
- Fix the remaining document endpoints to match Strapi semantics (input + return shape). No new infra.

## Key Insights (mismatches found)
- **update-status**: Strapi batch `{ids, status, rejectionReason}` → `{success, error, idsSuccess, idsError}`. NestJS single `{documentId, status}`. Rewrite to batch.
- **merge-file**: Strapi body `{documentIds, mode, templateId}` (resolve program from template). NestJS `{documentIds, mode, programId?}` — missing templateId. Add templateId; resolve program via template.
- **upload-status (checkS3StatusByDocumentIds)**: Strapi query `ids` (csv) → per-doc `s3_upload_status`. NestJS takes `programId` (wrong semantics). Rewrite to ids-based.
- **stats**: Strapi takes full `IFindDocument` filters. NestJS only `programId`. Add filter support (reuse list's filter builder).
- **findOne /:id**: Strapi returns `formatDocument + {is_exist_validation_log, isCanUpdateStatus}`. NestJS returns raw doc. Add flags (best-effort: isCanUpdateStatus via step-scope; is_exist_validation_log — no validation_logs table → false/omit, flag in memory).
- **user-created/updated/approved/rejected**: Strapi returns distinct USERS (id+email) matching permission + keyword(email). NestJS returns current-user docs. Rewrite to list distinct users (join doc→user via FK column). Needs `User` repo + keyword email search + pagination.
- **download /:id/download**: Strapi streams S3. NestJS returns doc metadata (no S3 infra). Keep metadata return (acceptable — media pipeline deferred). Just ensure step-scope check (already assertDocStep).
- **delete /:id**: No Strapi parity (NestJS-only). Keep soft-delete + assertDocStep. Note in comment.

## Requirements
### Functional
- update-status: accept `{ids:number[], status, rejectionReason?}`, return `{success,error,idsSuccess,idsError}`. Only update docs in INPROGRESS program + ACTIVE project. APPROVAL/REJECTED require BICC-of-program (step-scope: user holds step at program); only docs currently SUBMIT. SUBMIT: any step-holder. Set columns: APPROVAL→approved_at+approved_by; REJECTED→rejection_reason+rejected_by+rejected_at; all→document_status+updated_by.
- merge-file: body `{documentIds, mode, templateId}`. Load template→program. Permission: step-scope at program. Create log_merge_files row (PROCESSING). Return `{id, name}`. (No async job — NestJS has no BIPaymentService.mergeFile; just create log. Flag as TODO.)
- upload-status: query `ids` (csv) → `[{id, s3_upload_status}]` for visible subset (step-scope per doc's program).
- stats: query `IFindDocument` (reuse filter builder from list, minus paging) → `{total, SUBMIT, APPROVAL, REJECTED}`. Hardcode status IN (APPROVAL,REJECTED,SUBMIT) like Strapi (DRAFT excluded).
- findOne /:id: return doc + `is_exist_validation_log` (false — no table) + `isCanUpdateStatus` (user holds step at doc's program).
- user-created/updated/approved/rejected: query `{keyword, page, limit}` → distinct users `{id, email}` who created/updated/approved/rejected bi-payment docs the caller can see (step-scope). keyword filters email ILIKE. Paginate.

### Non-functional
- Reuse existing filter builder (extract from list into a private helper) for stats.
- No new infra (S3/eventBus/validation_logs) — omit/TODO.
- Keep `@RequirePermission` verb gates; step-scope via service.

## Architecture
- Extract `applyListFilters(qb, query, programId, allowed)` private helper in service (shared by list + stats).
- update-status: new DTO `UpdateDocumentStatusDto {ids, status, rejectionReason}`. Service loops docs, checks program INPROGRESS + project ACTIVE + step-scope, updates columns per status.
- merge-file: new DTO `MergeFileDto {documentIds, mode, templateId}`. Load template (+ program). assertDocStep-ish (step-scope at program). Create log row.
- upload-status: query `ids`. Per-doc: load doc+program, step-scope, collect `{id, s3_upload_status}`.
- user-*: inject `UserRepository` (or `Repository<User>`). Query distinct users via doc FK columns (uploaded_by_id/ rejected_by_id). Strapi has updated_by/approved_by link tables — NestJS doc has only uploaded_by_id + rejected_by_id. So:
  - user-created → uploaded_by_id
  - user-updated → uploaded_by_id (NestJS no updated_by; map to uploaded_by as closest)
  - user-approved → NO approved_by column → return [] (or omit). Flag.
  - user-rejected → rejected_by_id
  Limit to docs in programs the caller has step-scope (resolve via step-scope global viewable + program filter? Simpler: join doc→program, filter program in caller's accessible programs via getAccessibleRecords). Given complexity, narrow: list distinct users from docs where caller holds ANY step at that program (resolveAllowedWorksteps per program is expensive). PRAGMATIC: filter by programs in caller's data_access (getAccessibleRecords on programs) — reuse existing.

## Related Code Files
### Modify
- `bi-payment-document.controller.ts` — update-status DTO, merge-file DTO, upload-status query, stats query, findOne return, user-* signatures.
- `bi-payment-document.service.ts` — all endpoint methods + extract filter helper.
- DTOs: new `update-document-status.dto.ts`, `merge-file.dto.ts`; update search DTO (already done phase before).
- `bi-payment.module.ts` — inject User repository if needed.

### Tests
- Update `bi-payment-document.service.step-scope.spec.ts` if signatures change.
- New tests: update-status batch, merge-file templateId, upload-status ids, stats filters, user-created distinct users.

## Implementation Steps
1. Extract `applyListFilters` helper from `list`; refactor `list` to use it.
2. `stats`: use `applyListFilters` + aggregate SELECT (COUNT total + per-status). Return `{total, SUBMIT, APPROVAL, REJECTED}`.
3. `updateStatus`: new DTO batch; rewrite service (loop, program/project checks, step-scope, per-status columns).
4. `merge`: new DTO with templateId; load template+program; step-scope; create log (PROCESSING); return `{id,name}`.
5. `getMergeStatus`/`downloadMerged`: keep (already return log metadata). downloadMerged requires COMPLETED.
6. `uploadStatus`: rewrite to ids-based (query `ids`); per-doc step-scope; return `[{id,s3_upload_status}]`.
7. `findOne`/`download`: return doc + `is_exist_validation_log:false` + `isCanUpdateStatus` (step-scope). Keep download metadata-only.
8. `listUserCreated/Updated/Approved/Rejected`: rewrite to distinct users (id+email) via doc FK; keyword email ILIKE; paginate. user-approved → [] (no column).
9. Update controller signatures + DTOs.
10. Typecheck + tests.

## Todo List
- [ ] Extract applyListFilters helper
- [ ] stats: aggregate via helper
- [ ] update-status: batch rewrite
- [ ] merge-file: +templateId
- [ ] upload-status: ids-based
- [ ] findOne: +flags
- [ ] user-*: distinct users
- [ ] DTOs + controller
- [ ] Typecheck + tests

## Success Criteria
- update-status batch matches Strapi return shape.
- merge-file accepts templateId, resolves program.
- upload-status ids-based.
- stats accepts full filters.
- user-* return distinct users.
- Tests pass; no type errors.

## Risk Assessment
- **user-updated/user-approved**: NestJS doc lacks updated_by/approved_by columns → user-updated maps to uploaded_by (imperfect), user-approved returns [] (data loss). Document clearly.
- **merge-file**: no async job infra → log created but no actual merge happens. Flag TODO; FE may poll status that never completes. Acceptable for now (user chose "đủ query+body+return").
- **step-scope cost**: per-doc/per-program step-scope in upload-status/user-* could be N queries. Use getAccessibleRecords(programs) once for the caller's accessible program set, filter by that.

## Security Considerations
- step-scope enforced per endpoint (no per-record data-scope, consistent with phase-04).
- update-status APPROVAL/REJECTED restricted to BICC-of-program (step-scope at program).

## Next Steps
- Implement per steps; test incrementally.
