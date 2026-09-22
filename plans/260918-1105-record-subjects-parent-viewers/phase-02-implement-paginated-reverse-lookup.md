---
phase: 2
title: Implement paginated reverse lookup
status: completed
priority: P2
effort: 4h
dependencies:
  - 1
---

# Phase 2: Implement paginated reverse lookup

## Overview

Green query-layer tests. Không wire HTTP. Không đổi `getUsersByRecordPermission`.

## Requirements

- SQL page DISTINCT ids rồi hydrate ids only (roles: id+name; users: id+email) — permissions/count có thể phase 3 nếu tách gọn; **prefer** query layer trả ids + name/email; hydrate permissions in service phase 3.
- Query layer: paged ids + total + name/email for current page.

## Architecture

`PermissionQueryService`:

```
listRolesForRecordPaged(parentTable, recordId, permCode, {search, skip, take})
listUsersForRecordPaged(parentTable, recordId, permCode, {search, skip, take})
```

Shape: `{ items: {id, name|email}[], total: number }`.

Reuse join/deny/date-window/soft-delete from `queryUsersForRecord`. **Không** reuse unpaged `getUsersByRecordPermission`.

Pattern: subquery/CTE DISTINCT role_id or user_id WHERE allow minus deny, ILIKE, `ORDER BY id`, `OFFSET/LIMIT`, then join display cols. Count = COUNT trên cùng filter không page.

## Related Code Files

- Modify: `src/common/authorization/services/permission-query.service.ts`
- Modify: `src/common/authorization/__tests__/permission-query-record-subjects.spec.ts` (green)

## Implementation Steps

1. Implement two paged methods + private SQL helpers.
2. Keep tableName regex.
3. Run `permission-query-record-subjects.spec.ts` + `permission-query-record-users.spec.ts` — users spec **unchanged pass**.

## Success Criteria

- [ ] Query specs green.
- [ ] Existing `getUsersByRecordPermission` specs still green.
- [ ] No controller yet.

## Risk Assessment

TypeORM subquery skip/take on DISTINCT — verify generated SQL in unit via skip/take called. If QB too awkward, raw SQL parameterized (table name still regex-validated).
