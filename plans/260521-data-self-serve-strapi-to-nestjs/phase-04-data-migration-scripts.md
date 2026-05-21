---
phase: 4
title: "Data Migration Scripts"
status: pending
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 4: Data Migration Scripts

## Overview

Add ETL scripts to migrate Strapi data-self-serve metadata and relations into the NestJS schema.

## Requirements

- Functional: migrate requests, validation logs, segments, industries, and config.
- Functional: resolve Strapi `created_by_user` / `updated_by_user` link tables into Nest `created_by_user_id` / `updated_by_user_id`.
- Non-functional: idempotent upserts, batch processing, sequence reset.

## Architecture

Follow existing `src/data-migrations/metadata/*` and `src/data-migrations/relation/*` classes. Metadata scripts copy base table data; relation script resolves user link tables and validation log request IDs if needed.

## Related Code Files

- Create: `src/data-migrations/metadata/data-self-serve-request.data-migration.ts`
- Create: `src/data-migrations/metadata/data-self-serve-validation-log.data-migration.ts`
- Create: `src/data-migrations/metadata/data-self-serve-config.data-migration.ts`
- Create: `src/data-migrations/metadata/data-self-serve-lookup.data-migration.ts`
- Create: `src/data-migrations/relation/data-self-serve-request.data-migration.ts`
- Modify: `src/data-migrations/metadata-index.ts`
- Modify: `src/data-migrations/relation-index.ts`

## Implementation Steps

1. Extract request rows from Strapi `data_self_serve_requests`.
2. Upsert into Nest table preserving ids, timestamps, request params, response body, file paths, statuses.
3. Extract validation logs and upsert with `request_id`.
4. Extract segments/industries/config into target lookup/config tables.
5. Resolve creator/updater from Strapi link tables or legacy columns to Nest user ids.
6. Register table names in migration indexes.

## Success Criteria

- [ ] Each migration can run by `npm run start:data-migration -- --table_name=...`.
- [ ] Relation migration can run by `npm run start:relation-migration -- --table_name=data_self_serve_request`.
- [ ] Re-running scripts does not duplicate rows.

## Risk Assessment

Strapi may store user relations in link tables rather than direct columns. Scripts must tolerate missing tables/columns and no-op cleanly when a relation table is absent.
