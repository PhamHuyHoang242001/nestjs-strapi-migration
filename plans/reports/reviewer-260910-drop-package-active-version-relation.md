## Code Review Summary

### Scope
- Files: skill/prompt/api-catalog package entities, three *query.service.ts, migration 2609101500, related specs
- LOC: ~small refactor + drop-FK migration
- Focus: remove TypeORM `active_version` relation; keep `active_version_id`; HTTP still returns `active_version`
- Scout findings: no entity relation left; query services map via `versionsByIds`/`findActiveVersion`; leftover `pkg.active_version` only in test mocks

### Overall Assessment
Refactor matches the contract. Entities are column-only. List/detail/export shape `active_version` on the DTO, not on the entity. Version→package ManyToOne remains one-way (no circular TypeORM graph). DB circular FKs dropped in untracked migration `2609101500`.

### Critical Issues
None.

### High Priority
None for the stated checklist.

### Medium Priority
- **No DB FK after drop:** `active_version_id` can dangle if a version is hard-deleted. App code already nulls id on approve/delete paths; keep that. Entity comments still say "SET NULL when that version is deleted" — now app-only, not constraint-backed.
- **List extra round-trip:** innerJoin filters then `versionRepo.find` hydrates. Intentional; not a correctness bug.

### Low Priority
- Test fixtures still attach `active_version` on mock package objects so `versionRepo.findOne` can return them. Fine; not production mutation.
- Stale comment on `SkillVersion` "M7 decision" (plan ref in code; out of this task).

### Edge Cases Found by Scout
- Detail with `active_version_id` pointing at soft-deleted version: `findActiveVersion` returns null → `active_version: null` (list excludes via innerJoin).
- Download uses `findActiveVersion(..., ['files'])` not `pkg.active_version`.
- Inverse relation is only `SkillVersion.skill_package` / prompt / api — no package→version relation, so TypeORM will not recreate circular FK on sync (sync is off in prod anyway).

### Positive Observations
- Checklist (a–e) satisfied in source.
- HTTP `active_version` assembled in `shaped`/`detail` return objects.
- Join condition `av.id = pkg.active_version_id` + `pkg.active_version_id IS NOT NULL`.

### Recommended Actions
1. Ship with `2609101500-drop-package-active-version-fk.ts` (currently untracked).
2. Optionally update entity comments that still mention SET NULL FK.

### Metrics
- Type Coverage: n/a (review-only)
- Test Coverage: n/a (not executed)
- Linting Issues: n/a

### Unresolved Questions
- Confirm migration will be committed with this refactor.

**Status:** DONE
**Summary:** Relation removed from entities; query services load versions by id and still emit `active_version` on HTTP; no circular TypeORM FK. Residual risk is dangling ids without DB FK, already an accepted trade-off.
