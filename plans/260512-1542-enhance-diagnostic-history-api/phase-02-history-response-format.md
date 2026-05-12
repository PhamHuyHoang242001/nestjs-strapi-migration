# Phase 2 — History Response Format (file, updatedBy)

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 1h

Add `file: {type, url}`, `updatedBy: {id, email}` to history endpoint response. Remove raw `diagnostic_files_*` flat fields from output.

## Key Insights

Strapi (bi-diagnostic-user.ts:546-585):
- Joins `updatedBy` with `select: ["id", "email"]`
- `formatHistoryDiagnosticReport()` gom `diagnostic_files_url` + `diagnostic_files_type` → `file: { url, type }`
- Strapi uses Strapi's `updatedBy` (auto-managed). NestJS uses `created_by_admin_id` from `BaseAuthorAdminSoftDeleteColumn`.

**Note:** In NestJS history, `created_by_admin_id` = who created this history record = who made the change to the report. This is the `updatedBy` equivalent.

## Related Code Files

### Modify
- `src/modules/bi-hub-diagnostic-report/bi-hub-diagnostic-report.service.ts`
  - `findHistory()` (line 128-162) — add join to users table
- `src/modules/bi-hub-diagnostic-report/diagnostic-report-format.helper.ts`
  - Add `formatHistory()` function
- `src/modules/databases/bi-diagnostic-history-report.entity.ts`
  - Add ManyToOne relation to Users for `created_by_admin_id`

## Implementation Steps

### Step 1: Add User relation to history entity

```typescript
// bi-diagnostic-history-report.entity.ts — add import + relation
import { Users } from './user.entity';

// Inside class, after existing fields:
@ManyToOne(() => Users)
@JoinColumn({ name: 'created_by_admin_id' })
created_by_admin: Users;
```

### Step 2: Update findHistory() query

Current query (line 141-143):
```typescript
const qb = this.historyRepo
  .createQueryBuilder('h')
  .leftJoinAndSelect('h.bi_hub_diagnostic_report', 'report')
```

Add user join:
```typescript
const qb = this.historyRepo
  .createQueryBuilder('h')
  .leftJoinAndSelect('h.bi_hub_diagnostic_report', 'report')
  .leftJoin('h.created_by_admin', 'updater')
  .addSelect(['updater.id', 'updater.email'])
```

Update return to use formatter:
```typescript
// Before:
return { data, meta: ... };

// After:
return { data: data.map(formatHistory), meta: ... };
```

### Step 3: Add formatHistory() in helper

```typescript
// diagnostic-report-format.helper.ts

export function formatHistory(h: BIHubDiagnosticHistoryReport): Record<string, any> {
  const file = h.diagnostic_files_url
    ? { type: h.diagnostic_files_type, url: h.diagnostic_files_url }
    : null;

  return {
    id: h.id,
    name: h.name,
    code: h.code,
    version: h.version,
    is_change_link: h.is_change_link,
    change_log: h.change_log,
    file,
    updatedBy: h.created_by_admin
      ? { id: h.created_by_admin.id, email: h.created_by_admin.email }
      : null,
    created_at: (h as any).created_at,
    updated_at: (h as any).updated_at,
  };
}
```

**Note:** `diagnostic_files_id`, `diagnostic_files_name` not exposed — FE only needs `type` + `url`.

### Step 4: Add import in helper file

```typescript
import { BIHubDiagnosticHistoryReport } from '@modules/databases/bi-diagnostic-history-report.entity';
```

## Success Criteria
- [ ] `GET /bi-hub/diagnostic-report/history` returns `file: { type, url }` instead of flat fields
- [ ] Response includes `updatedBy: { id, email }` from users table
- [ ] Raw fields `diagnostic_files_id`, `diagnostic_files_name`, `diagnostic_files_url`, `diagnostic_files_type` not in response
- [ ] Compile passes
