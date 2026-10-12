---
phase: 1
title: Query + endpoint
status: completed
priority: P2
effort: 2.5h
dependencies: []
---

# Phase 1: Query + endpoint

## Overview

Add read-only reuse-matrix query + `GET /v1/ai-hub/coworker/reuse-matrix`. New service file — do not grow `coworker-query.service.ts` (~600 lines).

## Requirements

- Functional: columns = all active live coworkers; rows = paged active live skills; `cells[i]` true iff active skill version has a live `skill_version_coworkers` link to `columns[i].id`.
- Non-functional: 3 SQL queries max (columns, skill page+count, links). Parameter-bound. No N+1.

## Architecture

```
GET /v1/ai-hub/coworker/reuse-matrix?page&limit
  → CoworkerController.reuseMatrix
  → CoworkerReuseMatrixService.getMatrix(page, limit)
       1. SELECT coworker columns (active + live active_version)
       2. SELECT skill page + COUNT (active + live active_version)
       3. SELECT skill_version_coworkers for those version ids
       4. getPublishersByIds(skill.publisher_id)
       5. zip boolean cells in column order
```

Live predicates (copy existing): `deleted_at IS NULL AND COALESCE(is_deleted, false) = false`. Package `status = 'active'`. Join active version the same way `CoworkerQueryService.list` does (`innerJoin` on `active_version_id`).

Route **before** `@Get('items/:id')` so `reuse-matrix` is not captured as an id.

Auth: `@UseGuards(PermissionGuard)` + `@RequirePermission('coworker_upload')`. Differs from `GET items` (auth-only) — locked by product.

## Related Code Files

- Create: `src/modules/coworker/coworker-reuse-matrix.service.ts`
- Create: `src/modules/coworker/dto/list-reuse-matrix-query.dto.ts` (`page`/`limit` only, same transform/cap as `ListCoworkerQueryDto`)
- Modify: `src/modules/coworker/coworker.controller.ts` — add GET
- Modify: `src/modules/coworker/coworker.module.ts` — register service
- Modify: `src/modules/coworker/dto/index.ts` — export DTO
- Reuse: `AssetHubItemMetaReadService.getPublishersByIds` (already imported via `AssetHubCatalogModule`)

No new table. No `SkillPackage` `forFeature` if queries go through `packageRepo.manager.query`.

## Implementation Steps

1. DTO: `page` default 1, `limit` default 20 max 100. No search/status/publisher.
2. Service `getMatrix(query)`:
   - Columns SQL: `coworker_packages` + LEFT `coworker_versions` on `active_version_id`. Filter active + live + `active_version_id IS NOT NULL`. `ORDER BY cp.code`. Name = `COALESCE(cv.name, cp.code)`.
   - Rows: `skill_packages` INNER `skill_versions` on `active_version_id`. Same live/active filters. `ORDER BY av.name, pkg.id`. `LIMIT/OFFSET` from page/limit. Parallel `COUNT(*)` with identical WHERE (no total drift).
   - Links: `SELECT skill_version_id, coworker_package_id FROM skill_version_coworkers WHERE skill_version_id = ANY($1) AND live`. Ignore coworker ids not in the column set.
   - Publishers: `getPublishersByIds`. Missing publisher → `{ id: publisher_id, name: '' }` or omit name as `null` — pick one and test it (`null` preferred).
   - Build `cells` as `columns.map(c => linkSet.has(c.id))` per row. Empty columns → `cells: []`.
3. Controller: `GET reuse-matrix`, require userId, return service result.
4. Do not decorate usage_guide / PIC / supporters.

## Success Criteria

- [ ] `GET /v1/ai-hub/coworker/reuse-matrix` returns the locked JSON shape
- [ ] Columns not paginated; rows honor `meta.total/page/limit`
- [ ] Tick uses **active** skill version only
- [ ] Inactive / soft-deleted packages and dead versions excluded
- [ ] Route not shadowed by `items/:id`
- [ ] `coworker-query.service.ts` unchanged

## Risk Assessment

- Large coworker catalog → fat `columns` array. Accepted (HOLD: no column paging). If >500, log count; do not silently page.
- Join tables missing in an env that has not run `2610121700` → SQL 42P01. Prerequisite: run create+backfill migrations before cook.
- Coworker without active version excluded even if a skill still links it — correct per "active only".

## Security Considerations

- `coworker_upload` (explicit or SO implied). No data-access interceptor needed — catalog is workspace-wide, not per-record.
- Parameter-bound ids only. Table/fk names interpolated from constants, never request input.
