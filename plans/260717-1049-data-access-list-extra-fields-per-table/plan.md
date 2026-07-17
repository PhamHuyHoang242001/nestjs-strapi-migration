---
title: 'Data-access list: per-table extra fields (code-config map)'
description: >-
  Mở rộng GET /v1/data-access/list: thêm config object trong code
  (EXTRA_FIELDS_MAP: tableName -> field[]) để mỗi group trả thêm record_extra
  chứa các field tùy chọn của record. Client không truyền gì; dev khai báo trong
  config. Mảng rỗng/không khai báo → không thêm gì.
status: completed
priority: P2
branch: main
tags:
  - data-access
  - nestjs
  - config-driven
blockedBy: []
blocks: []
created: '2026-07-17T03:50:10.097Z'
createdBy: 'ck:plan'
source: skill
---

# Data-access list: per-table extra fields (code-config map)

## Overview

API `GET /v1/data-access/list` hiện trả mỗi group các field base: `data_id, module_id, module_name, module_path, record_name, record_path, table_name, rules[]`. Record info lấy từ bảng target chỉ gồm display-name column (`NAME_COLUMN_MAP`) + breadcrumb (`RecordPathService`).

Nhu cầu: muốn **chọn thêm các field tùy ý** của record theo từng loại bảng (vd `bi_hub_reports` thêm `code, status`). Cơ chế = **config object trong code** (không phải query param runtime): dev khai `EXTRA_FIELDS_MAP: Record<tableName, field[]>`. Khi fetch record của bảng nào, service check map đó, SELECT thêm các field; mảng rỗng hoặc bảng không khai báo → không thêm gì, field `record_extra` vắng.

## Decision summary (từ brainstorm)

- **Input**: code-config (`EXTRA_FIELDS_MAP` trong `constants/hierarchy-config.ts`), client không truyền.
- **Output**: mỗi group thêm `record_extra: {field:value}` (key tách rời khỏi base, tránh đụng tên). Không khai báo → key vắng.
- **Validation**: regex `/^[a-z_]+$/` sanitize (giống `getNameColumn` hiện tại). Dev trust config.
- **Scope**: chỉ `/list`. Không động `details/:id`, `by-user`, `by-role` (YAGNI).
- **Error isolation**: bảng hỏng/field sai → per-table `.catch()` fallback `{}` (giống tiền lệ `record_path` dòng 203).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Add EXTRA_FIELDS_MAP config + getExtraFields helper](./phase-01-add-extra-fields-map-config-getextrafields-helper.md) | Completed |
| 2 | [Extend batchFetchRecordNames into batchFetchRecordInfo + wire list()](./phase-02-extend-batchfetchrecordnames-into-batchfetchrecordinfo-wire-.md) | Completed |
| 3 | [Update list + scoped specs](./phase-03-update-list-scoped-specs.md) | Completed |

## Dependencies

- Không phụ thuộc plan nào. Plan trước `260709-2000-data-access-list-record-path` (record_path) đã **done** — đây là extension tiếp theo trên cùng endpoint, không xung đột.

## Key touchpoints

- `src/modules/data-access/constants/hierarchy-config.ts` (+config +helper)
- `src/modules/data-access/data-access.service.ts` (`batchFetchRecordNames` → `batchFetchRecordInfo`, `list` assemble)
- `src/modules/data-access/__tests__/data-access-list.service.spec.ts` (+cases)
- `src/modules/data-access/__tests__/data-access-list-scoped.spec.ts` (+cases)

## Constraints

- YAGNI/KISS/DRY. Giữ số query/table không đổi (1 query/table, SELECT mở rộng — không thêm round-trip).
- Backward-compat: client hiện tại không break (field mới additive, có field mới khi và chỉ khi config khai báo).
- Không tạo file enhanced mới; sửa trực tiếp file hiện có.
