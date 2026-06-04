---
phase: 1
title: "Create DTOs"
status: pending
priority: P2
effort: "15m"
dependencies: []
---

# Phase 1: Create DTOs

## Overview

Create request/response DTOs for config-data-self-serve CRUD operations using `class-validator` and `class-transformer`.

## Related Code Files

- Create: `src/modules/data-self-serve/dto/config-data-self-serve.dto.ts`
- Reference: `src/common/dto/common.dto.ts` (BaseSearchDto pattern)
- Reference: `src/common/dto/pagination.dto.ts` (PaginationDto pattern)

## Implementation Steps

1. Create `src/modules/data-self-serve/dto/config-data-self-serve.dto.ts`
2. Define `SearchConfigDataSelfServeDto`:
   - Extend `BaseSearchDto` (inherits `keyword`, `page`, `limit`, `sort`)
   - `keyword` will search by `key` field (ILIKE)
3. Define `CreateConfigDataSelfServeDto`:
   - `key: string` — `@IsNotEmpty()`, `@IsString()`, `@MaxLength(255)`
   - `value: Record<string, unknown>` — `@IsNotEmpty()`, `@IsObject()`
   - Add `@ApiProperty()` decorators for Swagger
4. Define `UpdateConfigDataSelfServeDto`:
   - `key?: string` — `@IsOptional()`, `@IsString()`, `@MaxLength(255)`
   - `value?: Record<string, unknown>` — `@IsOptional()`, `@IsObject()`

## Success Criteria

- [ ] DTOs validate correctly with class-validator
- [ ] Swagger decorators present for API docs
- [ ] Follows existing DTO patterns (BaseSearchDto, class-transformer)
