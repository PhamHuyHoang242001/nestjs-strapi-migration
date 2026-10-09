---
phase: 6
title: "Stats picker seed docs"
status: completed
priority: P3
effort: "3h"
dependencies: [5]
---

# Phase 6: Stats picker seed docs

## Overview

Dashboard stats + latest + user picker + seed test users + docs quyền. TDD spec stats/latest/picker trước.

## Requirements

- Functional: `GET /v1/asset-hub/stats` thêm coworker. `listLatest` thêm `coworkers[]`. Picker `RequirePermission` OR thêm 2 code coworker. Seed `coworker_uploader` / `coworker_approver` (approver **không** gán upload).
- Non-functional: docs `docs/skill-permission-redesign.md` + html cập nhật 4 WS / 2 code + SO + supporter.

## Related Code Files

- Modify: `latest-artifacts.service.ts` + `latest-artifacts.service.spec.ts` + `latest-artifacts-stats.service.spec.ts`
- Modify: `asset-hub-catalog.controller.ts` listUsers codes + `asset-hub-catalog-perm.spec.ts`
- Create: `src/scripts/seed-coworker-test-users.ts` (clone prompt seed)
- Modify: `docs/skill-permission-flow.md` ghi chú “định hướng đã plan 261009”; `docs/skill-permission-redesign.md` = nguồn sự thật mới (4 WS)
- Modify: `docs/codebase-summary.md` coworker module

## Implementation Steps

### TDD red

1. Stats spec: 4 phần tử, type `coworker`.
2. Latest spec: key `coworkers`.
3. Catalog perm spec: listUsers gồm coworker_upload/approve.

### Green

1. fetchWorkspaceStats coworker tables.
2. Picker codes.
3. Seed script + README snippet Authorization docs nếu có.
4. Docs.

## Success Criteria

- [x] Stats 4 WS.
- [x] Picker user có coworker codes.
- [x] Seed approver không có coworker_upload.
- [x] Docs khớp brainstorm (2 code, SO pending-only, supporter field).

## Risk Assessment

Latest SQL giả định cột version giống prompt — coworker **không** category/tags; `fetchLatestPerPackage` select cột chung (`name`, `version_no`, `submitted_by`, package `code`) — verify query không select `prompt_content`.
