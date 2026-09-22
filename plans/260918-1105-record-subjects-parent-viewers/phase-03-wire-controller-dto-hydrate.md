---
phase: 3
title: Wire controller DTO hydrate
status: completed
priority: P2
effort: 4h
dependencies:
  - 2
---

# Phase 3: Wire controller DTO hydrate

## Overview

HTTP + DataAccessService: resolve parent, pick unique parent VIEW, hydrate role permissions + user_count. Green `record-subjects.service.spec.ts`.

## Requirements

- `GET /v1/data-access/record-subjects/roles`
- `GET /v1/data-access/record-subjects/users`
- Query DTO: `table` (string), `data_id` (int), `search?`; `PaginationDecorator`.
- `@RequirePermission('perm_data_access_create')`

## Architecture

1. Validate `table` in `HIERARCHY_MAP` and parent non-null.
2. Parent ∈ `RULE_TARGET_TABLES`.
3. Load parent module by `table_name=parent`; permissions `action=read` active. 0 or >1 → 400.
4. Call paged query on parent + view code.
5. Roles extra (batch, page-sized ids only):
   - `roles_permissions` JOIN permission WHERE `module.table_name = child table`
   - `user_count` = COUNT user_roles per role_id (`deleted_at` null, role active)
6. Response `{ items, total, page, limit }`.

## Related Code Files

- Create: `src/modules/data-access/dto/record-subjects-query.dto.ts`
- Modify: `src/modules/data-access/data-access.controller.ts`
- Modify: `src/modules/data-access/data-access.service.ts`
- Modify: `src/modules/data-access/__tests__/record-subjects.service.spec.ts` (green)
- Modify: `src/modules/data-access/data-access.module.ts` only if extra repos needed (Permission, Role, UserRole)

## Implementation Steps

1. DTO + two GET.
2. Service methods `listRecordSubjectRoles` / `listRecordSubjectUsers`.
3. Inject `PermissionQueryService` if not already on DataAccessService — check constructor; else inject.
4. Green service specs.

## Success Criteria

- [ ] Two routes documented Swagger.
- [ ] Service specs green.
- [ ] No change to create/update/delete/list/handover.

## Risk Assessment

DataAccessService already large — extract `record-subjects.service.ts` nếu thêm >~80 LOC (project modularize >200 lines). Prefer dedicated small service nếu `data-access.service.ts` gần ngưỡng.
