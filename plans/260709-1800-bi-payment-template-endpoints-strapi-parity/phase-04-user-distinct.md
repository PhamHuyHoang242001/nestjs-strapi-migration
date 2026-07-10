# Phase 04 — user-created + user-updated → distinct USERS

## Context Links
- Parent: `./plan.md`
- Strapi: `findUserCreatedTemplate` (via `template_created_by`), `findUserUpdatedTemplate` (via `template_updated_by`).
- NestJS current: `listUserCreated`/`listUserUpdated` return **templates** touched by user (WRONG — Strapi returns distinct USERS).
- Reference (document): `BiPaymentDocumentService.distinctUsersByColumn` + `getAccessibleProgramIds`.

## Overview
Rewrite to return distinct USERS {id, email} who created/updated bi-payment templates the caller may see, scoped to programs caller holds ANY step code at. keyword→email ILIKE. Paginate `{data,meta}`. MIRROR document user-*.

## Requirements
### Functional
- `GET /user-created?keyword=&page=&limit=` → distinct users who created templates (template_created_by_id) in programs caller sees.
- `GET /user-updated?keyword=&page=&limit=` → distinct users who updated templates (template_updated_by_id) in programs caller sees.
- Scope: programs where caller holds ANY step code (`getAccessibleProgramIds(userId)` — union across 5 step codes via `permCache.getAccessibleRecords`). If none → `{data:[], meta}`.
- keyword → `LOWER(u.email) ILIKE :kw`.
- Paginate via `@PaginationDecorator`; return `{data:[{id,email}], meta}`.
- template_type BIPAYMENT filter (bi-payment templates only).

### Non-functional
- Reuse `@PaginationDecorator` + raw qb (DISTINCT user join).
- Inject `PermissionCacheService` (already available — same as document service).
- Admin (super_admin) sees all programs (no scope filter).
- `@RequirePermission(TEMPLATE_VIEW_PERMS)` verb gate stays.

## Architecture
- Service `listUserCreated(keyword, pagination, userId, admin)` → `distinctUsersByColumn('t.template_created_by_id', ...)`.
- Service `listUserUpdated(keyword, pagination, userId, admin)` → `distinctUsersByColumn('t.template_updated_by_id', ...)`.
- Private `distinctUsersByColumn(userCol, keyword, pagination, userId, admin)`:
  - if !admin: `getAccessibleProgramIds(userId)` → if empty return empty; `t.bi_payment_program_id IN (pids)`.
  - join `users u ON u.id = <userCol> AND u.deleted_at IS NULL`.
  - `t.deleted_at IS NULL`, `t.template_type = 'bi-payment'`, `<userCol> IS NOT NULL`.
  - `DISTINCT <userCol> AS id, u.email`.
  - keyword → email ILIKE.
  - paginate; map → `{id, email}`.
- Private `getAccessibleProgramIds(userId)` — mirror document service (5 codes → getAccessibleRecords on bi_payment_programs).

## Related Code Files
### Modify
- `template/bi-payment-template.controller.ts` — userCreated/userUpdated signatures (keyword + @PaginationDecorator + adminFlag).
- `template/bi-payment-template.service.ts` — inject PermissionCacheService; rewrite listUserCreated/listUserUpdated → distinctUsersByColumn + getAccessibleProgramIds.

## Implementation Steps
1. Service: inject `PermissionCacheService`; add `getAccessibleProgramIds` (copy from document service).
2. Service: add `distinctUsersByColumn` private helper.
3. Service: rewrite `listUserCreated`/`listUserUpdated` to call helper with created/updated column.
4. Controller: userCreated/userUpdated → `@Query('keyword')` + `@PaginationDecorator()` + adminFlag; pass userId+admin.
5. Typecheck.

## Todo List
- [x] inject PermissionCacheService
- [x] getAccessibleProgramIds helper
- [x] distinctUsersByColumn helper
- [x] rewrite listUserCreated/listUserUpdated
- [x] controller signatures
- [x] typecheck

## Success Criteria
- user-created/user-updated return distinct users {id,email} + pagination.
- Scoped to accessible programs (admin sees all).
- keyword filters email.
- No type errors.

## Risk
- `template_type = 'bi-payment'` filter: confirm enum value string. MaToolTemplateType.BIPAYMENT = 'bi-payment' (verify in code).
- `u.deleted_at` column: User extends BaseSoftDeleteEntity (has deleted_at). ✓.

## Next Steps
- phase-05 tests + typecheck.
