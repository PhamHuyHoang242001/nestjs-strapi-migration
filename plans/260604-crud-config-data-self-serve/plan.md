---
title: "CRUD API config-data-self-serve"
description: "Create CRUD endpoints for config_data_self_serve table in DataSelfServeModule"
status: pending
priority: P2
branch: "main"
tags: [nestjs, crud, config]
blockedBy: []
blocks: []
created: "2026-06-04T02:52:29.715Z"
createdBy: "ck:plan"
source: skill
---

# CRUD API config-data-self-serve

## Overview

Add CRUD API endpoints for the `config_data_self_serve` table to the existing `DataSelfServeModule`. The table stores key-value configuration pairs (key: varchar, value: jsonb). APIs are for regular users with `BearerGuard` + `IsMaintenanceGuard`.

## Key Decisions

- **Module**: Add to existing `DataSelfServeModule` (entity already imported)
- **Auth**: `BearerGuard` + `IsMaintenanceGuard` only (no permission guard)
- **Pagination**: Extend `BaseSearchDto` pattern (keyword, page, limit)
- **Validation**: Key must be unique, value is free-form JSON object
- **Delete**: Hard delete (entity has no soft-delete columns)

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config-data-self-serve` | List paginated, search by key |
| GET | `/config-data-self-serve/:id` | Get by ID |
| POST | `/config-data-self-serve` | Create (key unique check) |
| PATCH | `/config-data-self-serve/:id` | Update (key unique check excl self) |
| DELETE | `/config-data-self-serve/:id` | Hard delete |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Create DTOs](./phase-01-create-dtos.md) | Pending |
| 2 | [Implement Service](./phase-02-implement-service.md) | Pending |
| 3 | [Implement Controller](./phase-03-implement-controller.md) | Pending |
| 4 | [Register Module](./phase-04-register-module.md) | Pending |

## Dependencies

- Entity exists: `src/modules/databases/config-data-self-serve.entity.ts`
- Already imported in `DataSelfServeModule` via `TypeOrmModule.forFeature`
- No cross-plan dependencies
