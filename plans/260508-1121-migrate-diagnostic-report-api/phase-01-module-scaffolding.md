---
phase: 1
title: Module Scaffolding
status: pending
priority: high
effort: 1.5h
---

# Phase 1 — Module Scaffolding

## Overview
Create the NestJS module structure for diagnostic report: module, 2 controllers (user + admin prefix), service, DTOs. Entity already exists.

## Context Links
- Reference pattern: `src/modules/bicc-department/` (controller, service, module, dto/)
- Entity: `src/modules/databases/bi-diagnostic-report.entity.ts`
- Related entities: `bi-diagnostic-file.entity.ts`, `bi-diagnostic-history-report.entity.ts`, `bi-diagnostic-scope.entity.ts`

## File Structure

```
src/modules/bi-hub-diagnostic-report/
├── bi-hub-diagnostic-report.module.ts
├── bi-hub-diagnostic-report-user.controller.ts   # 5 routes /bi-hub/diagnostic-report/*
├── bi-hub-diagnostic-report-admin.controller.ts   # 6 routes /admin/diagnostic/*
├── bi-hub-diagnostic-report.service.ts            # shared business logic
└── dto/
    ├── index.ts
    ├── search-diagnostic-report.dto.ts
    ├── create-diagnostic-report.dto.ts
    ├── update-diagnostic-report.dto.ts
    ├── search-diagnostic-history.dto.ts
    ├── search-updated-user.dto.ts
    ├── increase-view.dto.ts
    ├── delete-many-diagnostic-report.dto.ts
    └── download-diagnostic-report.dto.ts
```

## Implementation Steps

### 1. Module file
```typescript
// bi-hub-diagnostic-report.module.ts
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BIHubDiagnosticReport,
      BiHubDiagnosticFile,
      BIHubDiagnosticHistoryReport,
      BiHubDiagnosticScope,
    ]),
  ],
  controllers: [
    BiHubDiagnosticReportUserController,
    BiHubDiagnosticReportAdminController,
  ],
  providers: [BiHubDiagnosticReportService],
  exports: [BiHubDiagnosticReportService],
})
export class BiHubDiagnosticReportModule {}
```

### 2. Register in app.module.ts
Add `BiHubDiagnosticReportModule` to imports array.

### 3. User Controller skeleton
```typescript
@Controller()  // no prefix — routes defined per-handler to match Strapi paths exactly
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard)
@UseInterceptors(DataAccessInterceptor)
export class BiHubDiagnosticReportUserController {
  // GET  /bi-hub/diagnostic-report
  // GET  /bi-hub/diagnostic-report/updated-user  (before :id to avoid route collision)
  // GET  /bi-hub/diagnostic-report/history
  // POST /bi-hub/diagnostic-report/view
  // GET  /bi-hub/diagnostic-report/:id
}
```

**Route order matters:** Static paths (`/updated-user`, `/history`, `/view`) MUST come before `/:id` to avoid NestJS treating them as param values.

### 4. Admin Controller skeleton
```typescript
@Controller()  // no prefix — routes defined per-handler
@ApiBearerAuth()
@UseGuards(BearerGuard, IsMaintenanceGuard, PermissionGuard)
@UseInterceptors(DataAccessInterceptor)
export class BiHubDiagnosticReportAdminController {
  // POST   /admin/diagnostic/report
  // GET    /admin/diagnostic/report/download  (before :id)
  // PATCH  /admin/diagnostic/report/:id
  // DELETE /admin/diagnostic/report/:id
  // DELETE /admin/diagnostic/report
  // PATCH  /admin/diagnostic/sync-group-manager
}
```

### 5. DTOs (matching Strapi query/body params exactly)

**SearchDiagnosticReportDto** (GET /bi-hub/diagnostic-report):
```typescript
// Query params matching Strapi FE
keyword?: string        // search name, summary, bu_name, txt_diagnostic_scope
sortField?: string      // 'createdAt' | 'total_view' | 'updatedAt'
sortValue?: string      // 'ASC' | 'DESC'
page?: number           // default 1
limit?: number          // default 10
reportCategoryId?: number  // now maps to bicc_department_id (category removed)
labelIds?: string       // comma-separated
reportStatus?: string   // 'active' | 'inactive'
```

**CreateDiagnosticReportDto** (POST /admin/diagnostic/report):
```typescript
name: string
summary?: string
insight?: object
icon: string
isSensitive: boolean
biccDepartment: number  // bicc_department_id
file: { fileUrl: string, name: string, type: string }
department: number
center: number
division: number
scopes?: string         // txt_diagnostic_scope
labels?: number[]
```
Note: `pic`, `supporter`, `groupPermissionIds`, `groupAdminPermissionIds`, `category` removed.

**UpdateDiagnosticReportDto:** PartialType of Create + id validation.

### 6. Service skeleton
```typescript
@Injectable()
export class BiHubDiagnosticReportService {
  constructor(
    @InjectRepository(BIHubDiagnosticReport)
    private readonly reportRepo: Repository<BIHubDiagnosticReport>,
    @InjectRepository(BiHubDiagnosticFile)
    private readonly fileRepo: Repository<BiHubDiagnosticFile>,
    @InjectRepository(BIHubDiagnosticHistoryReport)
    private readonly historyRepo: Repository<BIHubDiagnosticHistoryReport>,
  ) {}
}
```

### 7. Compile check
Run `npx tsc --noEmit` after scaffolding.

## Todo
- [ ] Create module file
- [ ] Create user controller skeleton
- [ ] Create admin controller skeleton
- [ ] Create all DTO files
- [ ] Create service skeleton
- [ ] Register module in app.module.ts
- [ ] Compile check passes

## Success Criteria
- `npx tsc --noEmit` passes
- Module registered and routes visible in Swagger
- All DTO validations match Strapi payload format
