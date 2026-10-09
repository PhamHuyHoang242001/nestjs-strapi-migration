---
phase: 4
title: "Coworker schema and lookup GET"
status: completed
priority: P2
effort: "4h"
dependencies: [3]
---

# Phase 4: Coworker schema and lookup GET

## Overview

TDD: tables coworker + lookup channel/model + GET list + permissions `coworker_upload`/`coworker_approve` trên module coworker. Chưa write package.

## Requirements

- Functional: GET `/v1/ai-hub/coworker/channels` và `/models` Bearer, live rows. Perm codes tồn tại, module_id = coworker child.
- Non-functional: seed tối thiểu 1 channel + 1 model (SQL migration). Domain const **chưa** dùng (phase 5).

## Architecture

Tables:

- `coworker_packages` — như prompt_package + `code varchar unique partial live` (user-provided, NOT `coworker_<id>`)
- `coworker_package_responsibles`
- `coworker_versions` — name, short_description, kind, avatar_url, model_id, link, changelog, state, submitted_by, version_no, old_version. **Không** prompt_content, usage_guide, category, tags.
- `coworker_version_channels` — version_id, channel_id
- `ai_hub_coworker_channels` — id, name, soft-delete
- `ai_hub_coworker_models` — id, name, soft-delete

Partial unique pending 1/package (clone prompt index).

Entities + register `CoworkerModule` mỏng: controller GET lookups only.

## Related Code Files

- Create: entities under `src/modules/databases/coworker-*.ts` + channel/model
- Create: `src/migration/261009xxxx-create-coworker-tables.ts` + permissions insert (check `MAX(permission.id)`)
- Create: `src/modules/coworker/` module + controller GET channels/models + service list
- Create: `src/modules/coworker/__tests__/coworker-catalog.service.spec.ts`
- Create: `src/migration/__tests__/coworker-tables.spec.ts`
- Modify: `src/app.module.ts` import CoworkerModule
- Modify: `ALLOWED_COWORKER_LINK_ORIGINS` file const — có thể tạo sẵn phase 4, dùng phase 5

## Implementation Steps

### TDD red

1. Migration spec: CREATE 6 tables; unique `code` live; unique pending version.
2. Catalog spec: list channels/models filters `deleted_at IS NULL AND is_deleted IS NOT TRUE`.
3. Perm spec: controller GET lookups **không** RequirePermission.

### Green

1. Migration + seed 1–n lookup (tên placeholder OK).
2. Entities + module + GET.
3. Insert coworker_upload (POST/upload), coworker_approve (PATCH/approve) trên module coworker.

## Success Criteria

- [x] GET channels/models 200 Bearer, mảng seed.
- [x] Permission codes trong DB sau migrate.
- [x] Chưa POST /items.

## Risk Assessment

`code` unique vs soft-delete: partial index bắt buộc, không UNIQUE toàn bảng.
