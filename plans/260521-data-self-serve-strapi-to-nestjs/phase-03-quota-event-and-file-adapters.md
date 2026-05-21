---
phase: 3
title: "Quota Listener and File Adapters"
status: pending
priority: P1
effort: "3h"
dependencies: [2]
---

# Phase 3: Quota Listener and File Adapters

## Overview

Add Redis quota behavior, Nest event-emitter wiring, a `data-self-serve.listener.ts` Kafka bridge, and file download boundary.

## Requirements

- Functional: manual create and submit decrement per-user daily quota like Strapi.
- Functional: remaining usage endpoint reads quota config and Redis value.
- Functional: service emits internal events; listener handles `@OnEvent`, creates `EventData`, and calls `KafkaAdapter.publish`.
- Functional: event payloads match Strapi topic/event/key contracts.
- Non-functional: missing external infra must fail or log explicitly, not fake success.

## Architecture

`DataSelfServeQuotaService` wraps Redis operations and config lookup. `DataSelfServeService` injects `EventEmitter2` and emits data-self-serve event names after DB state changes. `DataSelfServeListener` lives in `data-self-serve.listener.ts`, uses `@OnEvent(...)`, creates Strapi-compatible `EventData`, then calls `KafkaAdapter.publish`. `DataSelfServeStorageService` streams files through a clear storage boundary.

## Related Code Files

- Create: `src/modules/data-self-serve/data-self-serve-quota.service.ts`
- Create: `src/modules/data-self-serve/data-self-serve.listener.ts`
- Create: `src/common/event-source/event-data.ts`
- Create: `src/common/consumer/topic.ts`
- Create: `src/common/infrastructure/kafka.adapter.ts`
- Create: `src/modules/data-self-serve/data-self-serve-storage.service.ts`
- Modify: `package.json`
- Modify: `src/common/infrastructure/redis.adapter.ts`
- Modify: `src/configuration/env.config.ts`

## Implementation Steps

1. Extend Redis adapter with safe `setNx`, `del`, and TTL helpers if needed.
2. Install/register `@nestjs/event-emitter`, plus direct Kafka/runtime deps if missing.
3. Implement per-user quota keys: `data_self_service:{requestGroup}:{userId}:{YYYYMMDD}`.
4. Implement listener methods for validate, push payload to DPC, push input file to S3, completed notification.
5. Move `EventData` and `KafkaAdapter.publish` parity code into common helpers used by the listener.
4. Implement download response helper with safe filename and stream handling.
6. Wire quota checks and `EventEmitter2.emit` calls into create, validate, submit, and service callback paths.

## Success Criteria

- [ ] Quota path mirrors Strapi remaining/decrement behavior.
- [ ] `data-self-serve.listener.ts` contains all `@OnEvent` handlers and all `EventData` + `KafkaAdapter.publish` calls for this feature.
- [ ] Event payload names and object shapes are preserved.
- [ ] Download endpoints reject missing path or missing storage config clearly.

## Risk Assessment

Nest lacks current Kafka/S3 config. Kafka bridge should be minimal and fail/log honestly; later infra can tune `KafkaAdapter` without touching request service logic.
