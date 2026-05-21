---
phase: 2
title: "Request Service and Creator Authorization"
status: pending
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Request Service and Creator Authorization

## Overview

Implement Strapi-equivalent request business logic with only creator-based authorization for user-facing operations.

## Requirements

- Functional: list/detail/stats/config/create/validate/submit/update behavior matches Strapi semantics.
- Functional: user can only see/download/submit own requests.
- Non-functional: use query builders/raw SQL only where simpler and parameterized.

## Architecture

The service uses TypeORM repositories for CRUD and query builder for filtered pagination. `created_by_user_id` and `updated_by_user_id` replace Strapi relation link tables.

## Related Code Files

- Create: `src/modules/data-self-serve/data-self-serve.service.ts`
- Create: `src/modules/data-self-serve/data-self-serve-format.helper.ts`
- Create: `src/modules/data-self-serve/data-self-serve-scope.helper.ts`
- Modify: `src/modules/databases/data-self-serve-request.entity.ts`
- Modify: `src/modules/databases/data-self-serve-validation-log.entity.ts`

## Implementation Steps

1. Implement `findRequest` filters: requestGroup, requestStatus, inputMethod, created date range, keyword, sort, pagination.
2. Implement `findOneRequest` with creator check and validation logs.
3. Implement `getRequestStats` with current-user filter and Strapi status defaults.
4. Implement `getRequestConfig` from branch configs, segments, industries.
5. Implement manual create and upload validation draft creation with request params/code generation.
6. Implement submit validated draft and service callback status update.

## Success Criteria

- [ ] Creator mismatch returns forbidden/bad request equivalent, not leaked data.
- [ ] Default list excludes draft and includes failed/processing/successfully like Strapi.
- [ ] Generated code uses `REQ-{year}-{id}`.
- [ ] Request params payload shape matches Strapi.

## Risk Assessment

Entity naming is currently inconsistent (`DataSelfServeRequest` vs `DataSelfServeRequests`). Fix imports repo-wide for compile rather than adding duplicate classes.
