# Phase 2 — Integrate Excel Export into Download Endpoint

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 1h

## Related Code Files

### Modify
- `src/modules/bi-hub-diagnostic-report/bi-hub-diagnostic-report-admin.controller.ts` — add `@Res()` param
- `src/modules/bi-hub-diagnostic-report/bi-hub-diagnostic-report-write.service.ts` — refactor `download()` to accept Response and stream Excel

## Implementation Steps

### Step 1: Modify controller to pass Response

Current (line ~29):
```typescript
download(@Query() query: DownloadDiagnosticReportDto, @Req() req: RequestWithInfo) {
  return this.service.download(query, req.info?.accessibleDataIds);
}
```

New:
```typescript
@Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
download(@Query() query: DownloadDiagnosticReportDto, @Req() req: RequestWithInfo, @Res() res: Response) {
  return this.service.download(query, res, req.info?.accessibleDataIds);
}
```

**Note:** When using `@Res()`, NestJS skips auto-serialization. The service must call `res.end()` itself (handled by `exportExcelToResponse`).

### Step 2: Refactor download() in write service

Change signature to accept `Response`. Transform data rows, then call `exportExcelToResponse()`.

```typescript
async download(query: DownloadDiagnosticReportDto, res: Response, accessibleDataIds?: number[]) {
  // ... existing query builder logic stays the same ...

  const reports = await qb.getMany();

  // Transform rows for Excel
  const rows = reports.map((item) => ({
    name: item.name,
    bicc_name: item.bicc_department?.name || '',
    bu_name: item.bu_name || '',
    insight: Array.isArray(item.insight) ? item.insight.join(', ') : (item.insight || ''),
    labels: item.labels?.map((l) => l.name).join(', ') || '',
    scopes: item.txt_diagnostic_scope || '',
    is_sensitive: item.is_sensitive ? 'Yes' : 'No',
    file_url: item.bi_hub_diagnostic_files?.[0]?.file_url || '',
    icon: item.icon || '',
    updated_by: '', // join user email if needed later
    updated_at: item.updated_at ? dayjs(item.updated_at).format('DD/MM/YYYY HH:mm') : '',
  }));

  await exportExcelToResponse(res, {
    sheetName: 'Diagnostic_Reports',
    columns: DIAGNOSTIC_REPORT_EXCEL_COLUMNS,
    rows,
  });
}
```

### Step 3: Define column config

In `diagnostic-report-format.helper.ts` or write service:

```typescript
export const DIAGNOSTIC_REPORT_EXCEL_COLUMNS: ExcelColumn[] = [
  { header: 'Report Analysis', key: 'name', width: 30 },
  { header: 'BICC Department', key: 'bicc_name', width: 20 },
  { header: 'BU Name', key: 'bu_name', width: 20 },
  { header: 'Insight', key: 'insight', width: 40 },
  { header: 'Labels', key: 'labels', width: 25 },
  { header: 'Scope', key: 'scopes', width: 30 },
  { header: 'Sensitive Data', key: 'is_sensitive', width: 15 },
  { header: 'File URL', key: 'file_url', width: 40 },
  { header: 'Icon', key: 'icon', width: 15 },
  { header: 'Updated By', key: 'updated_by', width: 25 },
  { header: 'Updated At', key: 'updated_at', width: 20 },
];
```

### Step 4: Add updated_by user join

Add user join to existing query builder in download():
```typescript
qb.leftJoin('users', 'updater', 'updater.id = report.updated_by_admin_id')
  .addSelect('updater.email', 'updater_email');
```

Then in row transform: `updated_by: item.updated_by_admin?.email || ''`

Alternatively, use a simpler approach — add relation to entity if not already present, or use raw query for the email.

## Success Criteria
- [ ] Controller passes `@Res()` to service
- [ ] `download()` streams Excel file instead of returning JSON
- [ ] Excel contains all 11 columns with correct data
- [ ] File downloads with proper filename (Diagnostic_Reports_DD-MM-YYYY_HHmm.xlsx)
- [ ] Compile passes
