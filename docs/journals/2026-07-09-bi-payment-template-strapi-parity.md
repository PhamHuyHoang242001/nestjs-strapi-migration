# Journal — Bi-Payment Template endpoints Strapi-parity

**Date:** 2026-07-09
**Plan:** `plans/260709-1800-bi-payment-template-endpoints-strapi-parity/`
**Extends:** [[bi-payment-document-all-endpoints-strapi-parity]] (document phase-05)

## What
Migrated all 9 bi-payment TEMPLATE endpoints to Strapi semantics (query/body/return shapes), mirroring the shipped document migration. Kept step×program scope (StepScopeService) — did NOT port Strapi's SQL EXISTS-probes.

## Endpoints migrated
- `GET /template` (findTemplateV2): IFindTemplate filters (projectId, version, createdByIds, updatedByIds, workstepType csv, keyword) + `@SortCamel` + `@PaginationDecorator` → `{data,meta}`.
- `GET /template/:id` (findOneTemplateById): + `is_uploader`, `canDuplicate` (create-code proxy, R5 deviation).
- `GET /template/:id/download`: metadata-only (S3 streaming TODO).
- `POST /template` (createTemplate): validation (name, uploadMethod, program/project active, workstep-vs-version rule) + assertWorkstep; sheets ignored (TODO).
- `POST /template/duplicate-many` (duplicateManyTemplate): `{fromProgramId,fromProjectId,toProgramId,listTemplate:[{id,name}]}`; name-uniqueness; atomic tx.
- `DELETE /template/:id` (deleteTemplate): blocks non-draft docs, project ACTIVE, step-scope-first; `softRemove`.
- `DELETE /template/delete-many?ids=` (deleteManyTemplate): per-template step-scope + doc-skip; atomic tx; `{success,error}`.
- `GET /template/user-created` / `user-updated`: distinct USERS `{id,email}` + pagination (was returning templates — wrong).

## Key decisions
- **AdminFlag pattern**: `{isAdmin}` from `req.info.user.type === 'super_admin'` — NOT `scope===null` (avoids the old admin-bypass-for-everyone trap; single-record endpoints have no @RequireDataAccess).
- **Visibility = step×program**: no per-record data-scope (phase-04 removed it). `resolveAllowedWorksteps` (throws on no-code) drives search out-of-scope → 403.
- **Infra gaps** (intentional, TODO): S3 streaming, eventBus log, sheet/column cascade (no sheet entity), approved_by columns.

## Code-review fixes (post-review)
- **C1 (critical)**: `delete`/`deleteMany` set `is_deleted=true` but never `deleted_at`; reads filter `deleted_at IS NULL` → deleted templates stayed visible. Switched to `softRemove`.
- **H1**: `duplicateMany`/`deleteMany` non-atomic → wrapped in `dataSource.transaction`; source-workstep validation moved before insert loop.
- **H2**: `create` missing `uploadMethod` required check → added.
- **L1**: `intersectWorksteps` silently accepted invalid enum → now throws 400 (parity w/ document `parseWorkstepType`).
- **M3**: `delete` checked project-active before step-scope (info leak) → assertTemplateStep first.

## Deferred (follow-ups)
- **M1**: user-* `total` = page-row count, not total match count — **FIXED** (added parallel `COUNT(DISTINCT userCol)` count query for both template AND document `distinctUsersByColumn`).
- **M2**: orphaned `update` method (no route) — keep/wire/remove TBD.

## Verification
- tsc: 0 errors in `src/modules/bi-payment/template/`.
- jest: 18/18 template specs pass; 51/51 across template+document+common (no regression).
- Pre-existing failures (category/history/other-file perm specs) unrelated — `User.updated_roles` type mismatch, fail even with changes stashed.

## Tests
- `template/__tests__/bi-payment-template.service.spec.ts` (NEW, 18 cases): search step-scope + filters + invalid-workstepType, details flags + canDuplicate, delete doc-link/project-active/softRemove, user-* distinct-users admin/non-admin/empty.
