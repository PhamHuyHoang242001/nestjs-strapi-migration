# Phase 02 — create + duplicateMany Strapi-parity

## Context Links
- Parent: `./plan.md`
- Strapi: `createTemplate`, `validationCreateTemplate`, `duplicateManyTemplate`.
- NestJS current: `create` (duplicate gộp via `fromTemplateId`), `duplicateMany` (batch copy, naive name `<name> (copy)`).

## Overview
- create: Strapi `ICreateTemplate` body (name, description, projectId, programId, workstepType, uploadMethod, sheets, templateType, status). NestJS has no sheet entity → accept fields, skip sheet cascade (TODO). Add validation (name-safe, name-duplicate, program active, project active, workstep-vs-version rule). Step-scope: caller must hold create-code (bp_template_create) at program OR SO own-all.
- duplicateMany: Strapi `IDuplicateManyTemplate` body `{fromProgramId, fromProjectId, toProgramId, listTemplate:[{id,name}]}`. NestJS current takes `templateIds` only. Rewrite to accept names + target program + validate name uniqueness + program active. Each duplicated template keeps source workstep_type, new name, target program, target program version.

## Requirements
### Functional
- **create** `POST /`:
  - Body `CreateBiPaymentTemplateDto` (camelCase; already exists — extend with optional `sheets?: any[]` ignored + TODO).
  - Validate: name safe (non-empty, no invalid chars — best-effort regex), name not duplicate (case-insensitive, is_deleted=false), program exists+active, project exists+active, workstepType allowed for program.version (version 0 → allow ex_prepare/prepare/recon_data/recon_feedback; else prepare/recon_data/recon_feedback).
  - Permission: `stepScope.assertWorkstep(userId, programId, workstepType)` OR admin. (caller holds the step at program — proxy for create permission; verb gate `bp_template_create` already on route).
  - Insert template row (template_status=SUBMIT, template_type=BIPAYMENT, version=program.version, created_by/updated_by=userId). NO sheet cascade (TODO).
  - Return `{id, name}`.
- **duplicateMany** `POST /duplicate-many`:
  - Body `{fromProgramId, fromProjectId, toProgramId, listTemplate:[{id,name}]}` (new DTO `DuplicateManyTemplateDto`).
  - Validate: fromProgramId/toProgramId present; caller holds step at fromProgram (via step-scope) OR admin; toProgram active; listTemplate names unique among themselves; names not already existing (is_deleted=false, type BIPAYMENT); source templates exist in fromProgram.
  - For each source: create new template (new name, target program, source workstep_type, target program.version, created_by/updated_by=userId, status SUBMIT, type BIPAYMENT). NO sheet cascade (TODO).
  - Return `{ template_duplicate: [{id, name}] }`.

### Non-functional
- Reuse `dataSource.transaction`.
- Step-scope via `StepScopeService.assertWorkstep` / `resolveAllowedWorksteps`.
- eventBus SAVE_BI_PAYMENT_LOG → omit (no eventBus; TODO).

## Architecture
- `create` service: validate → transaction insert. Extract `validateCreateTemplate(dto, userId)` private helper (port Strapi checks minus sheets).
- `duplicateMany` service: validate → transaction loop insert.
- DTOs: extend `CreateBiPaymentTemplateDto` (add `sheets?` optional, document ignored); new `DuplicateManyTemplateDto`.

## Related Code Files
### Modify
- `template/bi-payment-template.controller.ts` — duplicateMany signature (new DTO body).
- `template/bi-payment-template.service.ts` — create (validation), duplicateMany (rewrite with names+target+validation).
- `template/dto/create-bi-payment-template.dto.ts` — add optional `sheets?`.
- `template/dto/duplicate-many-template.dto.ts` — NEW.
- `template/dto/index.ts` — export.

## Implementation Steps
1. Extend CreateDto with optional `sheets?: any[]` (ignored, TODO comment).
2. Create `DuplicateManyTemplateDto` ({fromProgramId, fromProjectId, toProgramId, listTemplate:[{id,name}]}).
3. Service `create`: `validateCreateTemplate` (name-safe, dup-check, program/project active, workstep-vs-version) → assertWorkstep → insert.
4. Service `duplicateMany`: validate (from-scope, names unique, names not existing, sources exist in fromProgram, toProgram active) → transaction loop insert → return `{template_duplicate}`.
5. Controller duplicateMany: accept new DTO; pass userId.
6. Typecheck.

## Todo List
- [x] DuplicateManyTemplateDto + extend CreateDto
- [x] create validation
- [x] duplicateMany rewrite
- [x] controller duplicateMany DTO
- [x] typecheck

## Success Criteria
- create validates name/program/project/workstep; inserts row; returns {id,name}.
- duplicateMany accepts names+target; validates; returns {template_duplicate:[{id,name}]}.
- Step-scope enforced (admin bypass).
- No type errors.

## Risk
- No sheet cascade → duplicated template has no sheet_templates (data loss vs Strapi). Documented TODO; acceptable per "metadata-only" decision.
- name-safe regex: port `isSafeNameTemplate` heuristic (basic: non-empty, trimmed, no control chars). Imperfect.

## Next Steps
- phase-03 delete + deleteMany.
