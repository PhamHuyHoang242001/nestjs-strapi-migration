---
phase: 1
title: Module API DTOs
status: in-progress
priority: P1
effort: 2h
dependencies: []
---

# Phase 1: Module API DTOs

## Overview

Create the NestJS module surface for data-self-serve and route-compatible DTOs.

## Requirements

- Functional: expose all 11 Strapi-compatible routes under the same paths.
- Non-functional: keep files focused, kebab-case, DTO validation via existing Nest patterns.

## Architecture

`DataSelfServeModule` owns controller, service, quota service, publisher adapter, storage adapter. Controller uses `BearerGuard` for user routes. Service callback remains route-compatible at `/service/data-self-serve/:id`.

## Related Code Files

- Create: `src/modules/data-self-serve/data-self-serve.module.ts`
- Create: `src/modules/data-self-serve/data-self-serve.controller.ts`
- Create: `src/modules/data-self-serve/dto/*.dto.ts`
- Modify: `src/app.module.ts`
- Modify: `src/modules/databases/data-self-serve-request.entity.ts`
- Modify: `src/modules/databases/data-self-serve-validation-log.entity.ts`

## Implementation Steps

1. Normalize entity class names and relations without discarding current modified schema work.
2. Add DTOs for search, stats, create manual, validate upload, submit, service callback.
3. Add controller methods for each route with `@ApiTags`, `@ApiBearerAuth`, and existing guard conventions.
4. Register `DataSelfServeModule` in `AppModule`.

## Success Criteria

- [ ] All route handlers compile and call service methods only.
- [ ] DTOs constrain enum values and basic required fields.
- [ ] Existing route paths match Strapi strings exactly.

## Risk Assessment

Route collision risk around `/request/config`, `/request/stats`, and `/request/:id`; static routes must be declared before `:id`.
