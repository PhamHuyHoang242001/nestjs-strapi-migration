# Journal — Bi-Payment list-doc approvedByIds/updatedByIds filters

**Date:** 2026-07-09
**Fix type:** bug (missing IFindDocument parity filters)
**Extends:** [[bi-payment-document-all-endpoints-strapi-parity]]

## Symptom
`applyListFilters` (list-doc) had `createdByIds` + `rejectedByIds` branches but NO `approvedByIds` and NO `updatedByIds` — both present in Strapi `IFindDocument` (lines 308-310). Root cause: NestJS doc entity lacked `approved_by` and `updated_by` columns entirely (Strapi uses M:N link tables `ma_tool_documents_approved_by_lnk` / `document_updated_by_lnk`), so the prior migration punted with "TODO if columns added" → user-approved returned `[]`, user-updated proxied to `uploaded_by`.

## Root cause
Missing columns → missing filters → missing endpoints. No user-id filter for approvers/editors; `user-approved`/`user-updated` endpoints degraded.

## Fix (approach chosen: add scalar FK columns — user decision)
1. **Migration** `2607091900-add-approved-updated-by-to-bi-payment-documents.ts` (self-adjusting, IF NOT EXISTS): adds `approved_by_id INT`, `approved_at TIMESTAMPTZ`, `updated_by_id INT` to `bi_payment_documents` + partial indexes.
2. **Entity**: 3 new columns on `BiPaymentDocument` (mirror `rejected_by_id` pattern).
3. **DTO**: `SearchBiPaymentDocumentDto` + `approvedByIds` + `updatedByIds` (csv → IN).
4. **applyListFilters**: 2 new branches — `d.approved_by_id IN (:...abids)`, `d.updated_by_id IN (:...ubids)`. Shared by list + stats.
5. **updateStatus**: sets `updated_by_id` on every change; `approved_by_id`+`approved_at` on approval (was a no-op TODO).
6. **upload**: seeds `updated_by_id = userId` (last editor = uploader).
7. **user-approved**: `distinctUsersByColumn('d.approved_by_id', ...)` (was `[]`).
8. **user-updated**: `distinctUsersByColumn('d.updated_by_id', ...)` (was `uploaded_by` proxy).

## Deviation from Strapi (intentional)
Strapi tracks approvers/editors as M:N link tables (one doc can have multiple approvers). NestJS uses scalar `approved_by_id` (single approver) — simpler, matches the existing `rejected_by_id` convention, sufficient for the single-approver approval flow. Filter + endpoint semantics hold for the single-approver case.

## Verification
- New spec `applies approvedByIds + updatedByIds emit IN predicates` (17 doc specs pass). Confirmed it FAILS without the `applyListFilters` branch (temp-removed → failed) and passes with it.
- tsc: 0 errors in bi-payment/document+template.
- 52/52 across document+template+common (no regression).

## Blast radius / side-effects
- DB schema change (additive, nullable columns + partial indexes — no existing row altered, no read path broken).
- `user-approved` now returns real users instead of `[]` — contract change, but the old `[]` was a documented TODO bug, not intended behavior. `user-updated` shifts from `uploaded_by` to `updated_by_id` (more correct; pre-existing docs without `updated_by_id` won't appear until edited once).
- Pre-existing rows have `updated_by_id = null`; only new edits populate it. Acceptable (forward-looking).
