# Phase 01 — search + details + download Strapi-parity

## Context Links
- Parent: `./plan.md`
- Strapi: `strapiv5-old/src/api/bi-payment/services/bi-payment-template.ts` → `findTemplateV2`, `findOneTemplateById`, `downloadFileFormatTemplateBiPayment`, `findOneTemplate` (populate), `formatTemplate`.
- NestJS current: `template/bi-payment-template.controller.ts` (search/details/download), `template/bi-payment-template.service.ts` (search/details/download/assertTemplateStep/queryTemplates).

## Overview
- search: add Strapi-parity filters (projectId, version, createdByIds, updatedByIds, workstepType csv, keyword ILIKE name/desc) + sort (camelCase) + pagination → `{data,meta}`. Keep step×program scope (resolveAllowedWorksteps).
- details: Strapi `findOneTemplateById` returns `formatTemplate + {is_uploader, canDuplicate}`. NestJS returns raw template. Add flags (best-effort). Step-scope assert.
- download: Strapi streams excel. NestJS returns metadata (TODO S3). Keep metadata + step-scope assert.

## Requirements
### Functional
- **search** query (camelCase, Strapi `IFindTemplate`):
  - `programId` (required) → 400 if missing/invalid.
  - `projectId` (optional) → filter templates whose program belongs to project.
  - `workstepType` (optional, csv) → narrow allowed steps; each must be in allowed set else 403.
  - `version` (optional) → `t.version = :ver`.
  - `createdByIds` (csv) → `t.template_created_by_id IN (...)`.
  - `updatedByIds` (csv) → `t.template_updated_by_id IN (...)`.
  - `keyword` → `t.name ILIKE :kw OR t.description ILIKE :kw`.
  - `sortField` (createdAt|updatedAt|id, camelCase) + `sortValue` (ASC|DESC) via `@SortCamel`.
  - `page`/`limit` via `@PaginationDecorator`.
  - Return `{data: templates, meta}` via `execQueryPaignation`.
  - Scope: `resolveAllowedWorksteps(userId, programId)` → `t.workstep_type IN (allowed)` (SO own-all). workstepType csv narrows within allowed; outside → 403.
- **details** `GET /:id`:
  - Load template (+ program via relation for step-scope).
  - `assertTemplateStep` (step×program; admin bypass).
  - Return template + `{ is_uploader: true, canDuplicate: <caller holds bp_template_create code at program> }` (best-effort; Strapi uses bicc-of-program — see R5 deviation note).
- **download** `GET /:id/download`:
  - Load template; `assertTemplateStep`; return metadata (S3 streaming TODO).

### Non-functional
- Reuse `@SortCamel` (allowedFields `['id','createdAt','updatedAt']`, default `{sortField:'createdAt', sortValue:'DESC'}`).
- Reuse `@PaginationDecorator` + `execQueryPaignation`.
- Keep `TEMPLATE_VIEW_PERMS` (5 codes) `@RequirePermission` verb gate.
- No per-record data-scope (phase-04 removed it). Visibility = step×program.

## Architecture
- New DTO `SearchBiPaymentTemplateDto` (camelCase query: programId, projectId, workstepType, version, createdByIds, updatedByIds, keyword). Coerce programId/version to int via `@Transform`.
- Service `search(userId, dto, sortParams, pagination)`:
  - validate programId.
  - `allowed = resolveAllowedWorksteps`.
  - build qb: `t.deleted_at IS NULL`, `t.bi_payment_program_id = pid`, `t.workstep_type IN (allowed or workstepType-intersect)`.
  - optional filters (project via join to program, version, createdByIds, updatedByIds, keyword).
  - sort `t.<snake>` per sortParams; `execQueryPaignation`.
- Service `details(id, userId, admin)`: load + join program; assertTemplateStep; compute `canDuplicate` via `permCache.getAccessibleRecords(userId, 'bi_payment_programs', 'bp_template_create').includes(programId)`.
- Service `download(id, userId, admin)`: unchanged logic, keep metadata.

## Related Code Files
### Modify
- `template/bi-payment-template.controller.ts` — search signature (DTO + SortCamel + Pagination), details/download keep adminFlag.
- `template/bi-payment-template.service.ts` — search rewrite (filters+sort+pagination), details (+flags), download (unchanged).
- `template/dto/search-bi-payment-template.dto.ts` — NEW.
- `template/dto/index.ts` — export new DTO.

### Tests
- `template/__tests__/bi-payment-template.search.spec.ts` — NEW (filters, step-scope, pagination).

## Implementation Steps
1. Create `SearchBiPaymentTemplateDto` (camelCase, @Transform programId/version).
2. Controller `search`: `@Query() dto`, `@SortCamel(...)`, `@PaginationDecorator()`, pass userId+sort+pagination.
3. Service `search`: validate programId → allowed → qb with filters → sort → `execQueryPaignation`.
4. Service `details`: load template+program; compute `canDuplicate` via permCache create-code at program; return `{...tpl, is_uploader:true, canDuplicate}`.
5. Service `download`: keep metadata + assertTemplateStep.
6. Update dto/index.ts export.
7. Typecheck.

## Todo List
- [x] SearchBiPaymentTemplateDto
- [x] controller search signature
- [x] service search (filters+sort+pagination)
- [x] service details (+flags)
- [x] service download (keep)
- [x] typecheck

## Success Criteria
- search accepts all IFindTemplate filters + sort + pagination → `{data,meta}`.
- search step-scope: user without allowed step → empty/403 per workstepType.
- details returns is_uploader + canDuplicate; step-scope enforced.
- download returns metadata; step-scope enforced.
- No type errors.

## Risk
- `canDuplicate` approximates bicc-of-program with create-code-at-program — documented deviation (R5).
- `projectId` filter requires join template→program→project (program.project_id). One extra join.

## Next Steps
- phase-02 create + duplicateMany.
