# Phase 03 — delete + deleteMany Strapi-parity

## Context Links
- Parent: `./plan.md`
- Strapi: `deleteTemplate`, `deleteManyTemplate`.
- NestJS current: `delete` (softRemove, no document-check, @RequireOwnerScope), `deleteMany` (softRemove batch, no document-check, no bicc-scope).

## Overview
- delete: Strapi blocks if template has linked non-draft documents; requires project ACTIVE; bicc-of-program permission. NestJS port: block-if-documents + project-active + step-scope (create/delete code at program proxy). Soft-delete.
- deleteMany: Strapi `?ids=csv` → soft-delete batch, skip templates with linked documents, scope by accessible programs. Return `{success, error}`.

## Requirements
### Functional
- **delete** `DELETE /:id`:
  - Load template (+ program→project for status + documents for link-check).
  - Require `project.project_status === ACTIVE` (Strapi condition in findOne).
  - Block if template has non-draft, non-deleted documents → 400 `exists a link to the document`.
  - Permission: step-scope at program (caller holds bp_template_create OR bp_template_delete code) OR admin. (verb gate `bp_template_delete` on route).
  - Soft-delete (`is_deleted=true`, `template_updated_by_id=userId`). Use repo.softRemove.
  - Return `{id}`.
- **deleteMany** `DELETE /delete-many?ids=1,2,3`:
  - Parse ids csv.
  - Load templates (type BIPAYMENT, program→project ACTIVE), populate documents (non-draft, non-deleted).
  - For each: skip if has documents; else if caller has step-scope at its program → delete.
  - Soft-delete the deletable subset.
  - Return `{success, error}`.

### Non-functional
- Keep `@RequireOwnerScope` on single delete? — Strapi uses bicc-of-program, not owner. REMOVE `@RequireOwnerScope` (relies on step×program in service, like document delete). Step-scope via service `assertTemplateStep`-ish (caller holds delete-code at program).
- `bp_template_delete` verb gate stays on both routes.
- eventBus → omit (TODO).

## Architecture
- Service `delete(id, userId, admin)`: load template+program+documents; check project-active; check no-documents; assert step (delete-code at program); softRemove.
- Service `deleteMany(rawIds, userId, admin)`: parse; load templates+documents; loop (skip-if-docs, check step-scope per template's program); softRemove subset; return counts.
- Controller: remove `@RequireOwnerScope` from single delete; pass userId+adminFlag.

## Related Code Files
### Modify
- `template/bi-payment-template.controller.ts` — delete signature (userId+admin), remove @RequireOwnerScope.
- `template/bi-payment-template.service.ts` — delete (doc-check + project-active + step-scope), deleteMany (per-template step-scope + doc-skip).

## Implementation Steps
1. Service `delete(id, userId, admin)`: load w/ relations; project-active check; doc-link check; `assertTemplateStep`-style (delete code); softRemove; return {id}.
2. Service `deleteMany(rawIds, userId, admin)`: parse ids; load templates (+documents); loop skip-if-docs + step-scope-per-program; softRemove subset; return {success, error}.
3. Controller delete: pass userId + adminFlag; remove @RequireOwnerScope.
4. Controller deleteMany: pass userId + adminFlag.
5. Typecheck.

## Todo List
- [x] delete: doc-check + project-active + step-scope
- [x] deleteMany: per-template step-scope + doc-skip
- [x] controller: remove @RequireOwnerScope, pass adminFlag
- [x] typecheck

## Success Criteria
- delete blocks when template has non-draft documents.
- delete requires project ACTIVE.
- deleteMany skips templates with documents; scopes by step×program.
- Returns {id} / {success, error}.
- No type errors.

## Risk
- Removing `@RequireOwnerScope` changes single-delete auth path — now service step-scope (consistent w/ document). Verify OwnerScopeGuard doesn't break other routes (template-only).
- Step-scope per-template in deleteMany = N queries (acceptable, low volume).

## Next Steps
- phase-04 user-created + user-updated → distinct users.
