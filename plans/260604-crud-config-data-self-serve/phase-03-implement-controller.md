---
phase: 3
title: "Implement Controller"
status: pending
priority: P2
effort: "15m"
dependencies: [1, 2]
---

# Phase 3: Implement Controller

## Overview

Create `ConfigDataSelfServeController` with 5 CRUD endpoints using `BearerGuard` + `IsMaintenanceGuard`.

## Related Code Files

- Create: `src/modules/data-self-serve/config-data-self-serve.controller.ts`
- Reference: `src/modules/data-self-serve/data-self-serve.controller.ts` (existing pattern)

## Implementation Steps

1. Create `src/modules/data-self-serve/config-data-self-serve.controller.ts`
2. Class-level decorators:
   - `@Controller()` (use path-per-method pattern matching existing controller)
   - `@ApiTags('config-data-self-serve')`
   - `@ApiBearerAuth()`
   - `@UseGuards(BearerGuard, IsMaintenanceGuard)`
3. Inject `ConfigDataSelfServeService`
4. Implement endpoints:
   ```
   GET  'config-data-self-serve'      → findAll(@Query() query)
   GET  'config-data-self-serve/:id'  → findOne(@Param('id') id)
   POST 'config-data-self-serve'      → create(@Body() dto)
   PATCH 'config-data-self-serve/:id' → update(@Param('id') id, @Body() dto)
   DELETE 'config-data-self-serve/:id' → remove(@Param('id') id)
   ```
5. Add `@ApiOperation({ summary: '...' })` to each endpoint

## Success Criteria

- [ ] 5 endpoints (GET list, GET one, POST, PATCH, DELETE)
- [ ] Guards applied at class level
- [ ] Swagger tags and operation summaries
- [ ] Follows existing controller pattern (path-per-method, no base path on @Controller)
