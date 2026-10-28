---
phase: 2
title: Module skeleton common and lookups
status: completed
priority: P1
effort: 2h
dependencies:
  - 1
---

# Phase 2: Module skeleton, common and lookups

## Overview
Shared foundation so phases 3-5 can run in parallel without touching shared files.

## Related Code Files
- Create `src/modules/data-hub/data-hub.module.ts`. It imports `DataHubCommonModule`, `DataHubDataServiceModule`, `DataHubDictionaryModule` and `DataHubConsumerModule`. The three feature modules start empty; phases 3-5 fill them.
- Create `src/modules/data-hub/common/`:
  - `data-hub-common.module.ts`
  - `data-hub-user-ref.service.ts` — `resolve(ids)`, `toRef(map, id)`, `assertUsers(manager, ids)`
  - `data-hub-query.util.ts` — `liveSql(alias)`, `escapeLike`, `toNumberArray` / `toStringArray` Transform helpers, and a base pagination DTO
  - `data-hub-pg-error.util.ts`
  - `data-hub-org.controller.ts` + `data-hub-org.service.ts` (contract §A; replaced the original `/lookups` endpoint)
- Create empty feature modules:
  - `data-service/data-hub-data-service.module.ts`
  - `dictionary/data-hub-dictionary.module.ts`
  - `consumer/data-hub-consumer.module.ts`
- Modify `src/app.module.ts`: register `DataHubModule`.

## Success Criteria
- [x] `GET /api/v1/data-hub/{divisions,departments,request-units}` return org lists, selecting only the columns they need (enums are declared in FE and BE)
- [ ] unit tests for user-ref (batched, `{id,email}`, unknown id → email null) and the query utils
- [ ] tsc / eslint / jest green
