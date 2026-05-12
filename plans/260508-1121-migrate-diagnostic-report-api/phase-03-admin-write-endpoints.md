---
phase: 3
title: Admin Write Endpoints
status: pending
priority: high
effort: 2.5h
---

# Phase 3 — Admin Write Endpoints (6 routes)

## Overview
Implement 6 admin endpoints for CUD + download + sync. Auth is unified (user + role + data_access), NOT old admin auth. Route paths kept exactly as Strapi FE expects.

## Context Links
- Strapi source: `strapiv5-old/src/api/bi-hub-report/services/bi-diagnostic-admin.ts`
- Old permission helpers: `strapiv5-old/src/api/bi-hub-report/middlewares/bi-diagnostic-report.ts`

## Key Differences from Strapi

| Aspect | Old Strapi | New NestJS |
|--------|-----------|------------|
| Auth | `authAdmin` middleware, `ctx.state.admin` | `BearerGuard` → `req.info.user` |
| Permission check | `getDiagnosticReportIDsAdminPermission()` raw SQL | `@RequirePermission()` + `@RequireDataAccess()` |
| Permission create | `eventBus.emit(CREATE_USER_DATA_PERMISSION)` | Direct insert to `data_access` + `user_data_access`/`role_data_access` |
| Transaction | `strapi.db.transaction({ onCommit, onRollback })` | TypeORM `DataSource.transaction()` or `QueryRunner` |
| Removed fields | `pic`, `supporter`, `category`, `groupPermissionIds`, `groupAdminPermissionIds` | Not in payload/response |
| Path hierarchy | `bicc_dept.category.report` | `bicc_dept.report` (category removed) |

---

## Endpoint 6: POST `/admin/diagnostic/report`

**Strapi handler:** `createReportDiagnostic` (lines 1112-1207)

**Request body (FE sends):**
```typescript
{
  name: string;             // required
  summary?: string;
  insight?: object;         // JSON
  icon: string;             // required
  isSensitive: boolean;
  biccDepartment: number;   // bicc_department_id
  file: {                   // diagnostic file
    fileUrl: string;
    name: string;
    type: string;           // 'POWER_BI' | 'SUPERSET' | 'FILE'
  };
  department: number;       // org hierarchy
  center: number;
  division: number;
  scopes?: string;          // txt_diagnostic_scope (text, not relation)
  labels?: number[];        // label IDs to connect M:N
  // REMOVED: pic, supporter, category, groupPermissionIds, groupAdminPermissionIds
}
```

**Service logic:**
```typescript
async create(dto: CreateDiagnosticReportDto, userId: number) {
  return this.dataSource.transaction(async (manager) => {
    // 1. Create report
    const report = manager.create(BIHubDiagnosticReport, {
      name: dto.name,
      summary: dto.summary,
      insight: dto.insight,
      icon: dto.icon,
      is_sensitive: dto.isSensitive,
      bicc_department_id: dto.biccDepartment,
      department_id: dto.department,
      center_id: dto.center,
      division_id: dto.division,
      txt_diagnostic_scope: dto.scopes,
      is_deleted: false,
      version: 0,
      total_view: 0,
      diagnostic_report_status: 'active',
      created_by: userId,
      updated_by: userId,
    });
    const saved = await manager.save(report);

    // 2. Create diagnostic file
    if (dto.file?.fileUrl) {
      const file = manager.create(BiHubDiagnosticFile, {
        file_url: dto.file.fileUrl,
        name: dto.file.name,
        type: dto.file.type,
        lastest_version: true,
        bi_hub_diagnostic_report_id: saved.id,
        status: 'active',
      });
      await manager.save(file);
    }

    // 3. Generate code: BICC_{deptCode}_{reportId}
    const biccDept = await manager.findOne(BiHubBiccDepartment, {
      where: { id: dto.biccDepartment },
    });
    saved.code = `BICC_${biccDept?.code || 'UNKNOWN'}_${saved.id}`;
    await manager.save(saved);

    // 4. Connect labels M:N
    if (dto.labels?.length) {
      await manager
        .createQueryBuilder()
        .relation(BIHubDiagnosticReport, 'labels')
        .of(saved.id)
        .add(dto.labels);
    }

    // 5. Create initial history record
    await this.createHistoryReport(manager, saved.id, userId);

    return { id: saved.id };
  });
}
```

---

## Endpoint 7: PATCH `/admin/diagnostic/report/:id`

**Strapi handler:** `updateReportDiagnostic` (lines 1854-1994)

**Request body:** Partial of create DTO (all optional).

**Service logic:**
```typescript
async update(id: number, dto: UpdateDiagnosticReportDto, userId: number, accessibleDataIds?: number[]) {
  // Permission check
  if (accessibleDataIds && !accessibleDataIds.includes(id)) {
    throw new ForbiddenException('No permission');
  }

  const existing = await this.reportRepo.findOne({
    where: { id, is_deleted: false },
    relations: ['labels', 'bi_hub_diagnostic_files', 'bicc_department'],
  });
  if (!existing) throw new NotFoundException('Report not found');

  return this.dataSource.transaction(async (manager) => {
    // 1. Build update object (only provided fields)
    const updateData: Partial<BIHubDiagnosticReport> = { updated_by: userId };
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.summary !== undefined) updateData.summary = dto.summary;
    if (dto.insight !== undefined) updateData.insight = dto.insight;
    if (dto.icon !== undefined) updateData.icon = dto.icon;
    if (dto.isSensitive !== undefined) updateData.is_sensitive = dto.isSensitive;
    if (dto.scopes !== undefined) updateData.txt_diagnostic_scope = dto.scopes;
    if (dto.biccDepartment !== undefined) updateData.bicc_department_id = dto.biccDepartment;
    if (dto.division !== undefined) updateData.division_id = dto.division;
    if (dto.center !== undefined) updateData.center_id = dto.center;
    if (dto.department !== undefined) updateData.department_id = dto.department;

    await manager.update(BIHubDiagnosticReport, id, updateData);

    // 2. Handle file update if provided
    if (dto.file) {
      // Mark old files as not latest
      await manager.update(BiHubDiagnosticFile,
        { bi_hub_diagnostic_report_id: id, lastest_version: true },
        { lastest_version: false }
      );
      // Create new file
      if (dto.file.fileUrl) {
        const newFile = manager.create(BiHubDiagnosticFile, {
          file_url: dto.file.fileUrl,
          name: dto.file.name,
          type: dto.file.type,
          lastest_version: true,
          bi_hub_diagnostic_report_id: id,
          status: 'active',
        });
        await manager.save(newFile);
      }
    }

    // 3. Update labels M:N if provided
    if (dto.labels) {
      // Remove existing, add new
      await manager.createQueryBuilder()
        .relation(BIHubDiagnosticReport, 'labels').of(id)
        .addAndRemove(dto.labels, existing.labels.map(l => l.id));
    }

    // 4. Create history record
    await this.createHistoryReport(manager, id, userId, existing);

    return { id };
  });
}
```

---

## Endpoint 8: DELETE `/admin/diagnostic/report/:id`

**Strapi handler:** `deleteOneReportDiagnostic` (lines 2561-2630)

**Service:**
```typescript
async deleteOne(id: number, userId: number, accessibleDataIds?: number[]) {
  if (accessibleDataIds && !accessibleDataIds.includes(id)) {
    throw new ForbiddenException('No permission');
  }

  const report = await this.reportRepo.findOne({
    where: { id, is_deleted: false },
  });
  if (!report) throw new NotFoundException('Report not found');

  // Soft delete via is_deleted flag (matching Strapi behavior)
  await this.reportRepo.update(id, { is_deleted: true });

  return { message: 'Delete success' };
}
```

**Note:** Strapi uses `is_deleted = true` (not TypeORM soft delete). Keep same behavior for data consistency.

---

## Endpoint 9: DELETE `/admin/diagnostic/report`

**Strapi handler:** `deleteManyReportDiagnostic` (lines 2631-2709)

**Query param:** `ids` (comma-separated string)

**Service:**
```typescript
async deleteMany(idsStr: string, userId: number, accessibleDataIds?: number[]) {
  const reportIds = idsStr.split(',').map(Number).filter(Boolean);
  if (!reportIds.length) throw new BadRequestException('Invalid IDs');

  const reports = await this.reportRepo.find({
    where: { id: In(reportIds), is_deleted: false },
  });

  // Filter to only accessible reports
  let deletableIds: number[];
  if (accessibleDataIds) {
    deletableIds = reports
      .filter(r => accessibleDataIds.includes(r.id))
      .map(r => r.id);
  } else {
    deletableIds = reports.map(r => r.id);
  }

  if (deletableIds.length > 0) {
    await this.reportRepo.update(
      { id: In(deletableIds) },
      { is_deleted: true },
    );
  }

  return {
    success: deletableIds.length,
    error: reports.length - deletableIds.length,
  };
}
```

---

## Endpoint 10: GET `/admin/diagnostic/report/download`

**Strapi handler:** `downloadReportDiagnostic` (lines 2305-2560)

**Query params:**
```typescript
download_type: 'ALL' | 'MULTIPLE'
ids?: string          // comma-separated (for MULTIPLE)
keyword?: string
sortField?: string
sortValue?: string
isDeleted?: boolean
```

**Service:**
```typescript
async download(query: DownloadDiagnosticReportDto, accessibleDataIds?: number[]) {
  const qb = this.reportRepo.createQueryBuilder('report')
    .leftJoinAndSelect('report.bi_hub_diagnostic_files', 'file', 'file.lastest_version = true')
    .leftJoinAndSelect('report.labels', 'label')
    .leftJoinAndSelect('report.bicc_department', 'bicc')
    .leftJoinAndSelect('report.division', 'division')
    .leftJoinAndSelect('report.center', 'center')
    .leftJoinAndSelect('report.department', 'department')
    .where('report.deleted_at IS NULL');

  qb.andWhere('report.is_deleted = :isDeleted', { isDeleted: query.isDeleted || false });

  if (query.download_type === 'ALL') {
    // Data access filter
    if (accessibleDataIds?.length > 0) {
      qb.andWhere('report.id IN (:...accessibleDataIds)', { accessibleDataIds });
    } else if (accessibleDataIds?.length === 0) {
      return [];
    }

    if (query.keyword?.trim()) {
      const kw = `%${query.keyword.trim()}%`;
      qb.andWhere('(report.name ILIKE :kw OR report.summary ILIKE :kw)', { kw });
    }

    const sortMap = { createdAt: 'created_at', name: 'name', total_view: 'total_view', updatedAt: 'updated_at' };
    qb.orderBy(`report.${sortMap[query.sortField] || 'created_at'}`, query.sortValue as 'ASC' | 'DESC' || 'DESC');
  } else if (query.download_type === 'MULTIPLE') {
    if (!query.ids) throw new BadRequestException('Missing IDs');
    const idArr = query.ids.split(',').map(Number).filter(Boolean);
    if (!idArr.length) throw new BadRequestException('Invalid IDs');
    qb.andWhere('report.id IN (:...idArr)', { idArr });
  }

  const reports = await qb.getMany();

  // Format for export (match Strapi response shape)
  return reports.map(item => ({
    ...item,
    bicc_name: item.bicc_department?.name,
    bu_name: `${item.division?.name}_${item.center?.name}_${item.department?.name}`,
    labels: item.labels?.map(l => l.name).join(','),
    scopes: item.txt_diagnostic_scope,
  }));
}
```

---

## Endpoint 11: PATCH `/admin/diagnostic/sync-group-manager`

**Strapi handler:** `syncGroupBIManagerToDiagnosticReport` (lines 3077-3159)

**Service:** Sync BI_MANAGER/BI_DIRECTOR group permissions to all diagnostic reports. This is an admin utility operation.

```typescript
async syncGroupManager() {
  // Implementation depends on how group permissions map to new data_access system
  // Core logic: find all reports → create data_access entries for BI manager roles
  // This may need discussion — the old system used event-based group_permission sync
  // New system uses role_data_access / user_data_access tables
}
```

**Note:** This endpoint's logic is tightly coupled to old permission system. May need redesign based on new data_access model. Flag for review.

---

## Shared Helper: createHistoryReport

```typescript
private async createHistoryReport(
  manager: EntityManager,
  reportId: number,
  userId: number,
  oldData?: BIHubDiagnosticReport,
) {
  const report = await manager.findOne(BIHubDiagnosticReport, {
    where: { id: reportId },
    relations: ['bi_hub_diagnostic_files', 'labels', 'division', 'center', 'department'],
  });
  if (!report) return;

  const latestFile = report.bi_hub_diagnostic_files?.find(f => f.lastest_version);

  const history = manager.create(BIHubDiagnosticHistoryReport, {
    name: report.name,
    version: (report.version || 0) + 1,
    change_log: oldData ? this.buildChangeLog(oldData, report) : { action: 'created' },
    diagnostic_files_id: latestFile?.id,
    diagnostic_files_name: latestFile?.name,
    diagnostic_files_url: latestFile?.file_url,
    diagnostic_files_type: latestFile?.type,
    bi_hub_diagnostic_report_id: reportId,
    is_change_link: report.is_change_link,
    code: report.code,
    created_by: userId,
    updated_by: userId,
  });
  await manager.save(history);

  // Increment version on report
  await manager.update(BIHubDiagnosticReport, reportId, {
    version: () => 'version + 1',
  });
}
```

---

## Todo
- [ ] Implement `create` with transaction + file + history
- [ ] Implement `update` with partial fields + file versioning + labels M:N
- [ ] Implement `deleteOne` with is_deleted flag
- [ ] Implement `deleteMany` with accessible filter
- [ ] Implement `download` with ALL/MULTIPLE modes
- [ ] Implement `syncGroupManager` (may need redesign discussion)
- [ ] Implement `createHistoryReport` helper
- [ ] Wire all 6 endpoints in admin controller
- [ ] Compile check

## Risk Assessment
- **syncGroupManager**: Tightly coupled to old permission model. Needs confirmation on new data_access equivalent.
- **File handling**: Strapi used media service for file uploads. NestJS may need separate file upload mechanism.
- **History report**: `change_log` JSON format must match what FE renders.

## Success Criteria
- Create returns `{ id }` and persists report + file + history
- Update handles partial fields, file versioning, label sync
- Delete sets `is_deleted = true` (not TypeORM softDelete)
- Download returns formatted export data
- All endpoints respect data_access filtering
