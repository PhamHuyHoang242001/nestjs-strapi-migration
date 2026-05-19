# Brainstorm Summary: Generic Transform-File in Common

## Problem Statement
`transform-file` module sits in `src/modules/`, hardcodes diagnostic-specific authorization decorators. Need to move to `src/common/` as shared infrastructure where each resolver self-manages permission/data-access.

## Requirements
- **Expected output:** `src/common/transform-file/` as generic module; diagnostic resolver moved to `src/modules/bi-hub-diagnostic-report/`
- **Acceptance criteria:** Same API behavior, same URL pattern, diagnostic permission checked inside resolver instead of controller decorator
- **Scope boundary:** Diagnostic only, no other modules. No logic changes.
- **Non-negotiable constraints:** Keep URL pattern `/media/transform-file/:id?model=xxx`, NestJS module pattern, TypeORM repos
- **Touchpoints:** `app.module.ts`, `diagnostic-report-format.helper.ts` (import paths), all spec files

## Evaluated Approaches

### Approach 1: Dynamic Module with Resolver Self-Auth (CHOSEN)
- Controller: only `BearerGuard` + `IsMaintenanceGuard`
- `TransformFileResolver` interface adds `authorize()` method
- `TransformFileModule.register({ resolvers: [...] })` — dynamic module
- Each resolver injects `PermissionCacheService` and checks permission + data-access internally
- **Pro:** Clean separation, each domain owns its auth logic, easy to add new resolvers
- **Con:** Resolver needs extra dependency injection for auth services

### Approach 2: Config-driven Permission Mapping
- Controller reads `model` query param → maps to permission/data-access via config table
- **Pro:** Centralized auth config
- **Con:** Coupling between controller and all domains, harder to customize per-domain logic
- **Rejected:** Less flexible for complex per-domain authorization

### Approach 3: Separate Controller per Domain
- Each domain has its own controller + decorators, shares service layer
- **Pro:** Standard NestJS pattern
- **Con:** Duplicated controller boilerplate, URL pattern divergence risk
- **Rejected:** Defeats purpose of shared module

## Final Architecture

```
src/common/transform-file/
├── transform-file.module.ts           # Dynamic module (.register)
├── transform-file.service.ts          # Strategy dispatcher
├── transform-file.controller.ts       # Generic, no permission decorators
├── transform-file.types.ts            # TransformFileResolver + authorize()
├── transform-file-link.helper.ts      # URL builder utilities
├── transform-file-link.helper.spec.ts

src/modules/bi-hub-diagnostic-report/
├── diagnostic-transform-file.resolver.ts        # Self-auth resolver
├── diagnostic-transform-file-link.helper.ts     # Diagnostic URL builder
├── diagnostic-transform-file.resolver.spec.ts
├── diagnostic-transform-file-link.helper.spec.ts
```

## Key Design Decisions
1. `authorize()` added to `TransformFileResolver` interface — called by service before `transform()`
2. `DiagnosticTransformFileResolver` injects `PermissionCacheService` to check `bh_diag_report_view` + `BI_HUB_DIAGNOSTIC_REPORTS`
3. `TransformFileModule.register()` dynamic module pattern — domain modules pass their resolvers
4. Admin requests skip data-access check (existing behavior preserved)

## Risks
- **Low:** Logic unchanged, only restructure + auth delegation
- **Medium:** Import path changes across codebase — mitigated by grep + batch update

## Files to Modify
- Move generic files: `transform-file.{module,service,controller,types}.ts`, `transform-file-link.helper.ts` → `src/common/transform-file/`
- Move diagnostic files: `diagnostic-*.ts` → `src/modules/bi-hub-diagnostic-report/`
- Update: `app.module.ts`, `diagnostic-report-format.helper.ts`, all spec files
- Update: `transform-file.module.ts` → dynamic module
- Update: `transform-file.controller.ts` → remove permission decorators
- Update: `transform-file.types.ts` → add `authorize()` to interface
- Update: `diagnostic-transform-file.resolver.ts` → add `authorize()` implementation with PermissionCacheService

## Next Steps
→ `/ck:plan` to create implementation phases
