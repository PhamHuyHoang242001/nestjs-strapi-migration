---
title: Migrate Data Self Serve from Strapi to NestJS
description: >-
  Migrate data-self-serve APIs, creator-only authorization, quota behavior,
  event/file adapter boundaries, and ETL scripts from Strapi v5 to NestJS
status: in-progress
priority: P1
branch: main
tags:
  - migration
  - data-self-serve
  - strapi
  - nestjs
  - api
  - etl
blockedBy: []
blocks: []
created: '2026-05-21T07:54:12.236Z'
createdBy: 'ck:plan'
source: skill
planDir: plans/260521-data-self-serve-strapi-to-nestjs
---

# Migrate Data Self Serve from Strapi to NestJS

## Overview

Move Strapi v5 `data-self-serve` into NestJS with route-compatible APIs and ETL scripts. Authorization is intentionally narrow: user-facing request access checks only `created_by_user_id = req.info.user.id`; broader permission/data-access rules are out of scope per user instruction.

## Scout Summary

- Target project: NestJS + TypeORM + Postgres in `nestjs-new/base-be-ts-sql`.
- Source Strapi files: `strapiv5-old/src/api/data-self-serve/**`, `src/common/services/data-self-serve.ts`, `src/common/consumer/topic.ts`.
- Existing Nest assets: data-self-serve entities/enums exist; no data-self-serve module/API exists.
- Existing Nest infra: Redis adapter exists; Kafka/event bus and S3 portal client do not.
- Event decision: use `@nestjs/event-emitter`; service emits internal events and `data-self-serve.listener.ts` owns `@OnEvent`, `EventData` creation, and `KafkaAdapter.publish`.
- Existing ETL pattern: `src/data-migrations/metadata/*`, `src/data-migrations/relation/*`, `metadata-index.ts`, `relation-index.ts`.

## Route Compatibility

| Method | Path | Behavior |
|---|---|---|
| GET | `/data-self-serve/request` | List current user's non-draft requests |
| GET | `/data-self-serve/usage/remaining` | Return current user's daily remaining quota |
| GET | `/data-self-serve/request/config` | Return book codes, segments, industries |
| GET | `/data-self-serve/request/stats` | Return status counts for current user |
| GET | `/data-self-serve/request/:id` | Return request detail if creator |
| GET | `/data-self-serve/request/download/:id` | Stream output file if creator and destination exists |
| GET | `/data-self-serve/request/file-input/download/:id` | Stream uploaded input backup if creator |
| POST | `/data-self-serve` | Manual request create + DPC publish |
| POST | `/data-self-serve/validate` | Upload validation draft create + validation publish |
| POST | `/data-self-serve/submit-request/:id` | Submit validated draft + DPC/S3 publish |
| PATCH | `/service/data-self-serve/:id` | Service callback updates processing request status |

## Boundaries

- In scope: APIs, DTOs, service logic, creator authorization, Redis quota, ETL scripts, module wiring, focused tests, build.
- Out of scope: full permission matrix/data-access rules, admin screens, DB schema changes beyond entity mapping.
- Event decision: add `EventEmitterModule`, emit data-self-serve events from the service, and centralize all Kafka publishing in `src/modules/data-self-serve/data-self-serve.listener.ts`.
- Storage decision: keep a clear storage boundary for downloads; if S3 config is absent, fail clearly rather than fake a successful download.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Module API DTOs](./phase-01-module-api-dtos.md) | In Progress |
| 2 | [Request Service and Creator Authorization](./phase-02-request-service-and-creator-authorization.md) | Pending |
| 3 | [Quota Event and File Adapters](./phase-03-quota-event-and-file-adapters.md) | Pending |
| 4 | [Data Migration Scripts](./phase-04-data-migration-scripts.md) | Pending |
| 5 | [Tests Build and Docs](./phase-05-tests-build-and-docs.md) | Pending |

## Dependencies

- Existing modified entity files must be preserved/adapted.
- `users`, `ma_tool_branch_configs`, `data_self_serve_segments`, `data_self_serve_industries`, `config_data_self_serve` tables must exist in target DB.
- Kafka env vars must be configured for external DPC/validator/notification publish; listener keeps Strapi payload parity.

## Success Criteria

- Nest builds with `npm run build`.
- Focused unit tests cover creator-only authorization, request create/list/detail/stats, quota, service callback validation, and ETL transform/load shape where practical.
- API paths and request/response field names match Strapi behavior for migrated endpoints.
- Data migration commands accept `table_name=data_self_serve_*` entries and are idempotent on primary keys.
- No unrelated files are reverted.
