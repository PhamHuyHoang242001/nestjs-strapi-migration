---
title: "Bi-Payment Template endpoints — Strapi-parity (query/body/return)"
description: "Migrate all bi-payment TEMPLATE endpoints to Strapi semantics (findTemplateV2 / create / duplicateMany / findOne / download / delete / deleteMany / user-created / user-updated). Reuse step×program scope (StepScopeService). Infra gaps (S3 streaming, eventBus, sheet/column cascade) → metadata-only + TODO, y hệt document phase-05."
status: done
priority: P1
branch: "main"
tags: [bi-payment, template, strapi-parity, permission]
blockedBy: []
blocks: []
created: "2026-07-09T00:00:00.000Z"
createdBy: "ck:cook"
source: skill
---

# Bi-Payment Template endpoints — Strapi-parity

## Overview
Template endpoints (`bi-payment-template.controller/service`) đã có step×program scope (phase-04 ship) NHƯNG query/body/return shape chưa khớp Strapi `findTemplateV2`/`findOneTemplateById`/`duplicateManyTemplate`/`findUserCreatedTemplate`/`findUserUpdatedTemplate`. Migrate shape only — giữ StepScopeService (bỏ SQL EXISTS-probes phức tạp của Strapi). MIRROR `document phase-05`.

## Decisions (locked via AskUserQuestion)
- **Scope**: TẤT CẢ template endpoints (search, details, download, create, duplicateMany, delete, deleteMany, user-created, user-updated).
- **Infra gaps**: metadata-only + TODO (no S3 streaming, no eventBus, no sheet/column cascade). Y hệt document.
- **Permission**: GIỮ `StepScopeService` step×program (resolveAllowedWorksteps). KHÔNG port SQL EXISTS-probes (BICC/BU/PIC/power-group/sales-group).
- **user-created/user-updated**: distinct USERS {id,email} + pagination (Strapi parity), KHÔNG trả templates.

## Phases
| Phase | Name | Status |
|-------|------|--------|
| 1 | [search + details + download Strapi-parity](./phase-01-search-details-download.md) | Pending |
| 2 | [create + duplicateMany Strapi-parity](./phase-02-create-duplicate.md) | Pending |
| 3 | [delete + deleteMany Strapi-parity](./phase-03-delete-deleteMany.md) | Pending |
| 4 | [user-created + user-updated → distinct users](./phase-04-user-distinct.md) | Pending |
| 5 | [Tests + typecheck](./phase-05-tests.md) | Pending |

## Dependencies
- Builds on shipped: StepScopeService (phase-01 of 260708 plan), step×program scope (phase-04), document Strapi-parity (phase-05).
- Reuses shared helpers: `execQueryPaignation`, `@SortCamel`, `@PaginationDecorator`, `PermissionCacheService.getAccessibleRecords`.
- No migration, no new table, no new entity.

## Key Patterns (mirror document phase-05)
- `adminFlag(req) = { isAdmin: req.info.user.type === 'super_admin' }` — NOT `scope===null`.
- Single-record endpoints (details/download/delete) → `{isAdmin}` từ controller, không `@RequireDataAccess`.
- `{data,meta}` return via `execQueryPaignation`.
- user-* → `distinctUsersByColumn` helper (join users table, scope by accessible programs).
- Template entity: `bi_payment_program_id` (FK), `template_created_by_id`/`template_updated_by_id` (plain int FK), `workstep_type` (enum), `version` (int).

## Infra TODOs (documented in code, NOT implemented)
- download: S3 streaming (excelJS exportMultipleSheetsWithConfig) — return metadata only.
- create/duplicate: sheet/column/validation-rule cascade (saveManySheetTemplate) — NestJS has no sheet_template entity; create returns `{id}` only.
- eventBus SAVE_BI_PAYMENT_LOG — NestJS has no eventBus; omit.

## Open (defer)
- `create` validation (isSafeNameTemplate, workstep-vs-program.version rule, name-duplicate check): port best-effort in service (no sheet validation — no sheet entity). Document as partial.
- `canDuplicate` flag in details: requires `getProgramBICCIds` (bicc dept walk). Approximate via step-scope (caller holds create-code at program). Flag as approximation.

## Red Team (quick self-check)
- **R1**: `search` sort on `t.created_at` (template table) — Strapi V2 sorts by `tem.created_at/updated_at/id`. Allowed fields = `id,createdAt,updatedAt`. ✓
- **R2**: `duplicateMany` must validate name uniqueness + target program active — port from Strapi. ✓
- **R3**: `delete` blocks if template has non-draft documents — port check. ✓
- **R4**: user-* scope = programs caller holds ANY step code at (getAccessibleProgramIds). Reuse document helper pattern. ✓
- **R5**: details `canDuplicate` — Strapi uses bicc-of-program. We approximate via step-scope (caller holds bp_template_create code at program). Documented deviation. ✓
