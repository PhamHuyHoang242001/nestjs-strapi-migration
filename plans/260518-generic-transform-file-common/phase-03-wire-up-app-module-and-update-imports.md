---
phase: 3
title: "Wire up app module and update imports"
status: pending
priority: P2
effort: "30m"
dependencies: [1, 2]
---

# Phase 3: Wire up app module and update imports

## Overview
Update `app.module.ts` to use `TransformFileModule.register()` with `DiagnosticTransformFileResolver`. Delete old `src/modules/transform-file/` directory. Add `@common/transform-file` path alias if needed.

## Requirements
- Functional: app boots correctly, transform-file endpoints work as before
- Non-functional: no dead code left in `src/modules/transform-file/`

## Related Code Files
- Modify: `src/app.module.ts`
- Modify: `tsconfig.json` (add path alias if not already mapped)
- Delete: `src/modules/transform-file/` (entire directory)

## Implementation Steps

1. **Check/add tsconfig path alias** for `@common/transform-file`:
   ```json
   {
     "paths": {
       "@common/*": ["src/common/*"]
     }
   }
   ```
   Verify `@common/*` alias already exists (likely does given `@common/types/request-with-info` usage). If yes, skip.

2. **Update `app.module.ts`**:
   ```typescript
   // FROM:
   import { TransformFileModule } from '@modules/transform-file/transform-file.module';
   // ...
   TransformFileModule,

   // TO:
   import { TransformFileModule } from '@common/transform-file';
   import { DiagnosticTransformFileResolver } from '@modules/bi-hub-diagnostic-report/diagnostic-transform-file.resolver';
   // ...
   TransformFileModule.register({
     resolvers: [DiagnosticTransformFileResolver],
   }),
   ```
   Also add required imports for the resolver's dependencies (entity repos, PermissionCacheService).
   The `BiHubDiagnosticReportModule` already imports `AuthorizationModule` from Phase 2.

3. **Verify no other files import from `@modules/transform-file/`**:
   ```bash
   grep -r "transform-file" src/ --include="*.ts" | grep -v "common/transform-file" | grep -v ".spec.ts"
   ```
   Update any remaining imports.

4. **Delete `src/modules/transform-file/`** directory entirely (all files already moved/recreated).

5. **Compile check**: `npx nest build` or `npx tsc --noEmit` to verify no broken imports.

## Success Criteria
- [ ] `app.module.ts` uses `TransformFileModule.register({ resolvers: [DiagnosticTransformFileResolver] })`
- [ ] `src/modules/transform-file/` directory deleted
- [ ] No file imports from `@modules/transform-file/`
- [ ] `npx tsc --noEmit` passes
- [ ] App boots without errors

## Risk Assessment
- **Low:** Straightforward import path updates
- **Mitigation:** grep all imports before deleting old folder; compile check after
