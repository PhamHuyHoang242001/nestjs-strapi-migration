# Phase 05 — Tests + typecheck

## Context Links
- Parent: `./plan.md`
- Reference tests: `document/__tests__/bi-payment-document.service.step-scope.spec.ts` (DB-mocked composition specs asserting emitted SQL shape — per memory `perm-real-db-integration-test-convention`).

## Overview
Add/extend tests for template endpoint shape changes. Typecheck entire module.

## Requirements
### Functional
- `template/__tests__/bi-payment-template.search.spec.ts` — assert: programId required (400), step-scope filter (workstep_type IN allowed), filters applied (version/createdByIds/keyword/projectId), sort + pagination shape `{data,meta}`.
- Extend existing template specs (if any) for details (is_uploader/canDuplicate flags), delete (doc-link block + project-active), user-* (distinct users shape).
- All tests DB-mocked (TypeORM mock repository) asserting emitted qb SQL shape — match document spec convention.

### Non-functional
- No real-DB harness (per memory: perm tests are DB-mocked composition specs).
- `npm run build` / typecheck clean (no new lint/type errors).
- Existing document/category/etc. tests still pass (no regression in shared helpers).

## Related Code Files
### Tests
- `template/__tests__/bi-payment-template.search.spec.ts` — NEW.
- `template/__tests__/bi-payment-template.details.spec.ts` — NEW (flags).
- `template/__tests__/bi-payment-template.delete.spec.ts` — NEW (doc-link + project-active).
- `template/__tests__/bi-payment-template.user-distinct.spec.ts` — NEW (distinct users).

## Implementation Steps
1. Write search spec (programId req, step-scope IN filter, filters, pagination).
2. Write details spec (flags present, step-scope enforced).
3. Write delete spec (doc-link block, project-active, step-scope).
4. Write user-distinct spec (distinct {id,email}, scope, keyword).
5. Run `npx tsc --noEmit` + jest for bi-payment template specs.
6. Run full bi-payment test suite (no regression in document specs).

## Todo List
- [x] search spec
- [x] details spec
- [x] delete spec
- [x] user-distinct spec
- [x] tsc --noEmit clean
- [x] jest bi-payment suite green

## Success Criteria
- All new template specs pass.
- tsc --noEmit: 0 errors.
- Existing bi-payment tests still pass (document/category/comment/history).

## Risk
- Mocking StepScopeService + PermissionCacheService in specs (document specs already do this — mirror).
- execQueryPaignation raw getCount — ensure mock returns count for meta.

## Next Steps
- Finalize: /ck:project-management sync-back, docs update, journal.
