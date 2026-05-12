# Phase 1 — Change Log Tracking in createHistoryRecord

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 1.5h

Rewrite `createHistoryRecord()` to build proper `change_log` with `change_description`, `old_data`, `new_data` — matching Strapi behavior.

## Key Insights

Strapi approach (bi-diagnostic-admin.ts:2794-2810):
- On **create** (version=0): `change_description = "create_new"`, `old_data = null`, `new_data = {full report}`
- On **update**: `change_description = [array of changed field keys]`, `old_data/new_data = only changed fields`
- `changeDescription` array built during validation by comparing each field

NestJS currently: `change_log: { action: "created" }` or `{ action: "updated" }` — no diff tracking.

## Trackable Fields (from Strapi ChangeReportField enum)

For diagnostic reports in NestJS, track these fields:
```
name, summary, insight, icon, is_sensitive, bicc_department_id, txt_diagnostic_scope, labels, file, bu_name, status
```

## Related Code Files

### Modify
- `src/modules/bi-hub-diagnostic-report/bi-hub-diagnostic-report-write.service.ts`
  - `createHistoryRecord()` (line 178-200) — rewrite to build change_log
  - `update()` (line 66-107) — pass changed field keys to createHistoryRecord

### Create
- `src/common/enums/change-report-field.enum.ts` — enum for trackable field keys (optional, can use string constants)

## Implementation Steps

### Step 1: Define change_log interface

In write service or a shared types file:
```typescript
interface HistoryChangeLog {
  change_description: string | string[];  // "create_new" or ["name","summary",...]
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
}
```

### Step 2: Build change detection in update()

Current `update()` already checks `if (dto.field !== undefined)` per field. Add change tracking:

```typescript
// Inside update(), before calling createHistoryRecord:
const changedKeys: string[] = [];
if (dto.name !== undefined && dto.name !== existing.name) changedKeys.push('name');
if (dto.summary !== undefined && dto.summary !== existing.summary) changedKeys.push('summary');
if (dto.insight !== undefined) changedKeys.push('insight');  // JSON, always mark if provided
if (dto.icon !== undefined && dto.icon !== existing.icon) changedKeys.push('icon');
if (dto.isSensitive !== undefined && dto.isSensitive !== existing.is_sensitive) changedKeys.push('is_sensitive');
if (dto.biccDepartment !== undefined && dto.biccDepartment !== existing.bicc_department_id) changedKeys.push('bicc_department_id');
if (dto.scopes !== undefined && dto.scopes !== existing.txt_diagnostic_scope) changedKeys.push('txt_diagnostic_scope');
if (dto.labels) changedKeys.push('labels');
if (dto.file) changedKeys.push('file');
```

Pass `changedKeys` and `existing` to `createHistoryRecord()`.

### Step 3: Rewrite createHistoryRecord()

```typescript
private async createHistoryRecord(
  manager: EntityManager,
  reportId: number,
  oldData?: BIHubDiagnosticReport,
  changedKeys?: string[],
) {
  const report = await manager.findOne(BIHubDiagnosticReport, {
    where: { id: reportId },
    relations: ['bi_hub_diagnostic_files', 'labels'],
  });
  if (!report) return;

  const latestFile = report.bi_hub_diagnostic_files?.find(f => f.lastest_version);

  // Build change_log
  let change_log: HistoryChangeLog;
  if (!oldData) {
    // CREATE action
    change_log = {
      change_description: 'create_new',
      old_data: null,
      new_data: this.extractReportSnapshot(report),
    };
  } else {
    // UPDATE action
    const keys = changedKeys || [];
    change_log = {
      change_description: keys,
      old_data: this.extractFieldsByKeys(oldData, keys),
      new_data: this.extractFieldsByKeys(report, keys),
    };
  }

  const history = manager.create(BIHubDiagnosticHistoryReport, {
    name: report.name,
    version: (report.version || 0) + 1,
    change_log,
    diagnostic_files_id: latestFile?.id || null,
    diagnostic_files_name: latestFile?.name || null,
    diagnostic_files_url: latestFile?.file_url || null,
    diagnostic_files_type: latestFile?.type || null,
    bi_hub_diagnostic_report_id: reportId,
    is_change_link: report.is_change_link,
    code: report.code,
  });
  await manager.save(history);
  await manager.update(BIHubDiagnosticReport, reportId, {
    version: () => 'COALESCE(version, 0) + 1',
  });
}
```

### Step 4: Helper methods for snapshot/diff

```typescript
private extractReportSnapshot(report: BIHubDiagnosticReport): Record<string, any> {
  return {
    name: report.name,
    summary: report.summary,
    insight: report.insight,
    icon: report.icon,
    is_sensitive: report.is_sensitive,
    bicc_department_id: report.bicc_department_id,
    txt_diagnostic_scope: report.txt_diagnostic_scope,
    labels: report.labels?.map(l => ({ id: l.id, name: l.name })),
    bu_name: report.bu_name,
    status: report.status,
  };
}

private extractFieldsByKeys(
  data: BIHubDiagnosticReport,
  keys: string[],
): Record<string, any> {
  const snapshot = this.extractReportSnapshot(data);
  return Object.fromEntries(keys.filter(k => k in snapshot).map(k => [k, snapshot[k]]));
}
```

### Step 5: Update call sites

**create()** (line 60):
```typescript
await this.createHistoryRecord(manager, saved.id);  // no oldData = create action
```
No change needed — already correct.

**update()** (line 104):
```typescript
await this.createHistoryRecord(manager, id, existing, changedKeys);
```

## Success Criteria
- [ ] `create()` stores `change_log: { change_description: "create_new", old_data: null, new_data: {...} }`
- [ ] `update()` stores `change_log: { change_description: ["name","summary"], old_data: {name: "old"}, new_data: {name: "new"} }`
- [ ] Labels change tracked as array of `{id, name}`
- [ ] File change tracked as key `"file"` in change_description
- [ ] Compile passes
