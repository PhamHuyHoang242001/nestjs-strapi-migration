---
phase: 4
title: "Update tests"
status: pending
priority: P2
effort: "45m"
dependencies: [1, 2, 3]
---

# Phase 4: Update tests

## Overview
Move spec files to new locations, update import paths, add test for `authorize()` method on `DiagnosticTransformFileResolver`.

## Requirements
- Functional: all existing tests pass with updated imports; new `authorize()` test added
- Non-functional: no spec files left in deleted `src/modules/transform-file/`

## Related Code Files
- Create: `src/common/transform-file/transform-file-link.helper.spec.ts`
- Create: `src/modules/bi-hub-diagnostic-report/diagnostic-transform-file.resolver.spec.ts`
- Create: `src/modules/bi-hub-diagnostic-report/diagnostic-transform-file-link.helper.spec.ts`

## Implementation Steps

1. **Move `transform-file-link.helper.spec.ts`** → `src/common/transform-file/`:
   - Update import path from `./transform-file-link.helper` (should remain same since co-located)
   - Verify existing tests pass unchanged

2. **Move `diagnostic-transform-file-link.helper.spec.ts`** → `src/modules/bi-hub-diagnostic-report/`:
   - Update import from `./diagnostic-transform-file-link.helper` (co-located, no change needed)
   - Update import of `TransformFileAudience` etc. from `@common/transform-file`

3. **Move `diagnostic-transform-file.resolver.spec.ts`** → `src/modules/bi-hub-diagnostic-report/`:
   - Update imports to new paths
   - Update `createResolver()` factory to inject mock `PermissionCacheService`:
     ```typescript
     const permissionCache = {
       hasPermission: jest.fn().mockResolvedValue(true),
       getAccessibleRecords: jest.fn().mockResolvedValue([7, 8, 9]),
     };
     return {
       resolver: new DiagnosticTransformFileResolver(
         reportRepo as any,
         historyRepo as any,
         logRepo as any,
         permissionCache as any,  // NEW
       ),
       // ...
     };
     ```

4. **Add `authorize()` tests** to `diagnostic-transform-file.resolver.spec.ts`:
   ```typescript
   it('authorize() allows admin without permission check', async () => {
     await resolver.authorize({
       id: 7, model: 'bi_diagnostic_report',
       info: { user: { id: 1 }, client: 'admin' },
     });
     expect(permissionCache.hasPermission).not.toHaveBeenCalled();
   });

   it('authorize() throws ForbiddenException when user lacks permission', async () => {
     permissionCache.hasPermission.mockResolvedValue(false);
     await expect(resolver.authorize({
       id: 7, model: 'bi_diagnostic_report',
       info: { user: { id: 1 }, client: 'user' },
     })).rejects.toBeInstanceOf(ForbiddenException);
   });

   it('authorize() loads accessibleDataIds for authorized user', async () => {
     permissionCache.hasPermission.mockResolvedValue(true);
     permissionCache.getAccessibleRecords.mockResolvedValue([7, 8]);
     const request = { id: 7, model: 'bi_diagnostic_report', info: { user: { id: 1 }, client: 'user' } };
     await resolver.authorize(request);
     expect(request.accessibleDataIds).toEqual([7, 8]);
   });
   ```

5. **Run all tests**: `npm test -- --testPathPattern="transform-file|diagnostic-transform"` to verify.

6. **Run full test suite**: `npm test` to check no regressions.

## Success Criteria
- [ ] `transform-file-link.helper.spec.ts` in `src/common/transform-file/` passes
- [ ] `diagnostic-transform-file.resolver.spec.ts` in `src/modules/bi-hub-diagnostic-report/` passes
- [ ] `diagnostic-transform-file-link.helper.spec.ts` in `src/modules/bi-hub-diagnostic-report/` passes
- [ ] New `authorize()` tests: admin bypass, permission denied, data-access loading
- [ ] Full test suite passes with no regressions

## Risk Assessment
- **Low:** Tests are copies with updated imports + new authorize() coverage
- **Mitigation:** Run tests incrementally per file before full suite
