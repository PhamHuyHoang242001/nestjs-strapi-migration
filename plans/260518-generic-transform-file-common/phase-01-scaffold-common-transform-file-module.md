---
phase: 1
title: "Scaffold common transform-file module"
status: pending
priority: P2
effort: "45m"
dependencies: []
---

# Phase 1: Scaffold common transform-file module

## Overview
Create `src/common/transform-file/` with generic files moved from `src/modules/transform-file/`. Convert `TransformFileModule` to dynamic module with `.register()`. Add `authorize()` to `TransformFileResolver` interface. Controller drops permission decorators.

## Requirements
- Functional: generic transform-file infrastructure in `src/common/`, no domain-specific code
- Non-functional: backward-compatible URL pattern `/media/transform-file/:id?model=xxx`

## Architecture
```
src/common/transform-file/
├── transform-file.module.ts           # Dynamic module with .register()
├── transform-file.service.ts          # Strategy dispatcher, calls authorize() then transform()
├── transform-file.controller.ts       # Generic — BearerGuard + IsMaintenanceGuard only
├── transform-file.types.ts            # TransformFileResolver interface with authorize()
├── transform-file-link.helper.ts      # URL builder utilities (unchanged logic)
├── index.ts                           # Public barrel exports
```

## Related Code Files
- Create: `src/common/transform-file/transform-file.module.ts`
- Create: `src/common/transform-file/transform-file.service.ts`
- Create: `src/common/transform-file/transform-file.controller.ts`
- Create: `src/common/transform-file/transform-file.types.ts`
- Create: `src/common/transform-file/transform-file-link.helper.ts`
- Create: `src/common/transform-file/index.ts`
- Delete (later in Phase 3): `src/modules/transform-file/` (entire folder)

## Implementation Steps

1. **Create `src/common/transform-file/` directory**

2. **Create `transform-file.types.ts`** — add `authorize()` to interface:
   ```typescript
   export interface TransformFileResolver {
     supports(model: TransformFileModel): boolean;
     authorize(request: TransformFileRequest): Promise<void>; // throws if unauthorized
     transform(request: TransformFileRequest): Promise<TransformFileResult>;
   }
   ```
   Keep `TransformFileRequest`, `TransformFileResult` unchanged.

3. **Create `transform-file-link.helper.ts`** — copy from current `src/modules/transform-file/transform-file-link.helper.ts` unchanged:
   - `TransformFileModel` enum
   - `TransformFileExternalType` enum
   - `TransformFileAudience` type
   - `isExternalTransformFile()`, `appendReportCode()`, `buildTransformFileUrl()`

4. **Create `transform-file.service.ts`** — modify flow to call `authorize()` before `transform()`:
   ```typescript
   async transform(request: TransformFileRequest): Promise<TransformFileResult> {
     if (!request.id || !request.model) throw new BadRequestException('Invalid transform request');
     const model = request.model as TransformFileModel;
     const resolver = this.resolvers.find((item) => item.supports(model));
     if (!resolver) throw new BadRequestException('Unsupported transform model');
     await resolver.authorize(request);  // NEW: resolver checks its own permissions
     return resolver.transform(request);
   }
   ```
   Constructor receives resolvers via `@Inject('TRANSFORM_FILE_RESOLVERS')` injection token.

5. **Create `transform-file.controller.ts`** — generic, no permission decorators:
   ```typescript
   @Controller()
   @ApiTags('transform-file')
   @ApiBearerAuth()
   @UseGuards(BearerGuard, IsMaintenanceGuard)  // No PermissionGuard, no DataAccessInterceptor
   export class TransformFileController {
     // GET media/transform-file/:id — no @RequirePermission, no @RequireDataAccess
     // GET admin/media/transform-file/:id — same
   }
   ```
   Keep `streamLocalFile()` private method, `DOWNLOAD_EXTENSIONS` set, redirect logic unchanged.

6. **Create `transform-file.module.ts`** — dynamic module:
   ```typescript
   @Module({})
   export class TransformFileModule {
     static register(options: { resolvers: Provider[] }): DynamicModule {
       return {
         module: TransformFileModule,
         controllers: [TransformFileController],
         providers: [
           TransformFileService,
           ...options.resolvers,
           {
             provide: 'TRANSFORM_FILE_RESOLVERS',
             useFactory: (...resolvers) => resolvers,
             inject: options.resolvers.map(r => typeof r === 'function' ? r : (r as any).provide),
           },
         ],
         exports: [TransformFileService],
       };
     }
   }
   ```

7. **Create `index.ts`** — barrel exports for public API:
   ```typescript
   export * from './transform-file.types';
   export * from './transform-file-link.helper';
   export { TransformFileModule } from './transform-file.module';
   export { TransformFileService } from './transform-file.service';
   ```

## Success Criteria
- [ ] `src/common/transform-file/` exists with all 6 files
- [ ] `TransformFileResolver` interface has `authorize()` method
- [ ] `TransformFileService` calls `authorize()` before `transform()`
- [ ] `TransformFileController` has no permission/data-access decorators
- [ ] `TransformFileModule.register()` accepts resolvers array
- [ ] TypeScript compiles without errors (may have unused import warnings until Phase 3)

## Risk Assessment
- **Low:** Mostly file creation with logic copied from existing module
- **Mitigation:** Keep logic identical, only structural changes
