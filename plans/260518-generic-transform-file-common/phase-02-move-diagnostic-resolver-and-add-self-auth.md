---
phase: 2
title: "Move diagnostic resolver and add self-auth"
status: pending
priority: P2
effort: "1h"
dependencies: [1]
---

# Phase 2: Move diagnostic resolver and add self-auth

## Overview
Move diagnostic-specific files from `src/modules/transform-file/` to `src/modules/bi-hub-diagnostic-report/`. Implement `authorize()` on `DiagnosticTransformFileResolver` to self-check permission (`bh_diag_report_view`) and data-access (`BI_HUB_DIAGNOSTIC_REPORTS`).

## Requirements
- Functional: diagnostic resolver checks its own permission + data-access, same authorization behavior as before
- Non-functional: admin requests bypass data-access check (preserve existing behavior)

## Architecture

Authorization flow change:
```
BEFORE: Controller decorator → PermissionGuard → DataAccessInterceptor → Service → Resolver
AFTER:  Controller (auth only) → Service → Resolver.authorize() → Resolver.transform()
```

`DiagnosticTransformFileResolver.authorize()` does:
1. Check permission `bh_diag_report_view` via `PermissionCacheService` (for non-admin)
2. Load `accessibleDataIds` via `PermissionCacheService.getAccessibleRecords()` (for non-admin)
3. Set `request.accessibleDataIds` for use in `transform()`

## Related Code Files
- Create: `src/modules/bi-hub-diagnostic-report/diagnostic-transform-file.resolver.ts`
- Create: `src/modules/bi-hub-diagnostic-report/diagnostic-transform-file-link.helper.ts`
- Modify: `src/modules/bi-hub-diagnostic-report/bi-hub-diagnostic-report.module.ts` — add resolver provider + entity imports

## Implementation Steps

1. **Move `diagnostic-transform-file.resolver.ts`** to `src/modules/bi-hub-diagnostic-report/`:
   - Update imports from `./transform-file-link.helper` → `@common/transform-file`
   - Update imports from `./transform-file.types` → `@common/transform-file`

2. **Add `authorize()` method** to `DiagnosticTransformFileResolver`:
   ```typescript
   constructor(
     // existing repos...
     private readonly permissionCache: PermissionCacheService,  // NEW
   ) {}

   async authorize(request: TransformFileRequest): Promise<void> {
     // Admin bypass — same as DataAccessInterceptor behavior
     if (request.info?.client === 'admin') return;

     const userId = Number(request.info?.user?.id);
     if (!userId) throw new ForbiddenException('User not authenticated');

     // Check permission
     const hasPermission = await this.permissionCache.hasPermission(userId, 'bh_diag_report_view');
     if (!hasPermission) throw new ForbiddenException('No permission');

     // Load data-access scoped IDs
     request.accessibleDataIds = await this.permissionCache.getAccessibleRecords(
       userId,
       DATA_ACCESS_TABLE.BI_HUB_DIAGNOSTIC_REPORTS,
       'bh_diag_report_view',
     );
   }
   ```

3. **Move `diagnostic-transform-file-link.helper.ts`** to `src/modules/bi-hub-diagnostic-report/`:
   - Update import from `./transform-file-link.helper` → `@common/transform-file`

4. **Update `bi-hub-diagnostic-report.module.ts`**:
   - Add `DiagnosticTransformFileResolver` to providers
   - Add `AuthorizationModule` to imports (for `PermissionCacheService`)
   - Add required TypeORM entities: `BiDiagnosticLog` (if not already imported)
   - Export `DiagnosticTransformFileResolver` so `TransformFileModule.register()` can use it

5. **Update `diagnostic-report-format.helper.ts`** import path:
   ```typescript
   // FROM:
   import { buildDiagnosticHistoryTransformFileUrl, buildDiagnosticReportTransformFileUrl } from '@modules/transform-file/diagnostic-transform-file-link.helper';
   import { TransformFileAudience } from '@modules/transform-file/transform-file-link.helper';
   // TO:
   import { buildDiagnosticHistoryTransformFileUrl, buildDiagnosticReportTransformFileUrl } from './diagnostic-transform-file-link.helper';
   import { TransformFileAudience } from '@common/transform-file';
   ```

## Success Criteria
- [ ] `DiagnosticTransformFileResolver` lives in `src/modules/bi-hub-diagnostic-report/`
- [ ] `authorize()` checks `bh_diag_report_view` permission + `BI_HUB_DIAGNOSTIC_REPORTS` data-access
- [ ] Admin requests bypass permission + data-access checks
- [ ] `diagnostic-transform-file-link.helper.ts` imports from `@common/transform-file`
- [ ] `diagnostic-report-format.helper.ts` imports updated
- [ ] TypeScript compiles without errors

## Risk Assessment
- **Medium:** Authorization logic reimplemented inside resolver — must match current behavior exactly
- **Mitigation:** Current behavior = `PermissionGuard` checks permission, `DataAccessInterceptor` loads `accessibleDataIds`. Resolver replicates both steps. Admin bypass preserved.
