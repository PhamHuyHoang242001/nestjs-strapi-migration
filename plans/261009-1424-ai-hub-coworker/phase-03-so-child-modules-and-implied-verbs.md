---
phase: 3
title: "SO child modules and implied verbs"
status: completed
priority: P1
effort: "1d"
dependencies: [2]
---

# Phase 3: SO child modules and implied verbs

## Overview

Tách Asset Hub 104 thành 4 module con `table_name` = package table. Own-all SO implied `*_upload`+`*_approve`. Wire `isAiHubWorkspaceSO` vào create / pending-edit / toggle / approve.

## Requirements

- Functional: Role sentinel `resource_owners (resource_type, resource_id=0)` → implied verbs đúng **1 WS**. SO skill không được `prompt_upload`.
- Non-functional: Giữ permission **id** 108/109/114/115/117/118; chỉ `UPDATE module_id`. Coworker perms = phase 4.

## Architecture

Module 104 giữ parent, `table_name` NULL, path `/asset-hub`. Con:

| path | table_name | resource_type |
|---|---|---|
| `/asset-hub/skill` | `skill_packages` | `ai_hub_skill` |
| `/asset-hub/prompt` | `prompt_packages` | `ai_hub_prompt` |
| `/asset-hub/api-catalog` | `api_catalog_packages` | `ai_hub_api_catalog` |
| `/asset-hub/coworker` | `coworker_packages` | `ai_hub_coworker` |

`coworker_packages` table chưa có (phase 4) — **vẫn insert module row** `table_name='coworker_packages'` (SO gán trước khi có data OK).

`HIERARCHY_MAP`: 4 keys `null`. `OWNER_ALL_TABLES` thêm 4. `ROOT_OWNER_CONFIG` + `NAME_COLUMN_MAP` (`code`). **Không** `RULE_TARGET_TABLES`.

Implied verbs: `action='upload'|'approve'` không bị exclude `create` → SO có upload+approve.

`isAiHubWorkspaceSO(userId, tableName)`: `getUserOwnerScope` có entry `rootTable=tableName && rootId===0`.

Hook:

- `createNew`: codes.has(upload) **∨** SO (PermissionGuard POST vẫn `RequirePermission upload` — **SO implied upload qua PermissionGuard** đã đủ. Service create không cần SO extra trừ khi guard fail. **Vẫn check SO ở service nếu guard chỉ explicit?** PermissionGuard đã fold implied verbs. POST OK cho SO.
- `createVersion`: canBump **only** — SO implied upload **qua guard** nhưng service **403** nếu không creator/supporter.
- `editVersion` pending: `isAiHubWorkspaceSO` only.
- `toggleStatus` / `approve`: creator/supporter/SO hoặc approve code (approve đã implied).

## Related Code Files

- Create: migration move module_id + insert 4 child modules (id: `SELECT MAX(id)+1` lúc cook, guard conflict)
- Modify: `hierarchy-config.ts` + `ma-tool-report-config.spec.ts` (OWNER_ALL size)
- Modify: `ai-hub-package-access.helper.ts` + spec SO pending/bump
- Modify: 3 upload services `editVersion` pending + toggle + createVersion 403 SO-not-owner
- Modify: `owner-scope-resolver.service.spec.ts` nếu thêm fixture table_name
- Modify: `role.service` không đổi nếu OWNER_ALL_TABLES đã iterate

## Implementation Steps

### TDD red

1. Config spec: 4 tables in `OWNER_ALL_TABLES`; `RESOURCE_TYPE_TO_ROOT_TABLE` 4 types; không nằm `RULE_TARGET_TABLES`.
2. Helper spec: `isAiHubWorkspaceSO` true khi scope sentinel; `canBump` false cho SO không creator/supporter.
3. Upload spec: mock SO true → `editVersion` pending 200; `createVersion` 403 nếu không owner.
4. PermissionGuard spec hiện có: implied upload → POST qua (không đổi nếu đã generic).

### Green

1. Migration modules + `UPDATE permission SET module_id=... WHERE code IN (...)`.
2. hierarchy-config.
3. Wire helper vào 3 upload services.
4. `getMyPermissions`: thêm `isWorkspaceSO` optional (query helper).

## Success Criteria

- [x] SO skill implied chỉ skill_* (test SQL/modules path).
- [x] SO pending edit 200; SO bump người khác 403.
- [x] `RULE_TARGET_TABLES` không chứa 4 package tables.
- [x] Owner-assignments UI nhận 4 resource_type sentinel (RoleService OWNER_ALL).

## Risk Assessment

Sai `mpath`/path LIKE → SO 1 WS inherit permission WS khác. Mitigate: child path `/asset-hub/skill` không prefix sibling; implied query `sub.path LIKE root_mod.path || '%'` — root_mod = child module (`table_name=skill_packages`), path `/asset-hub/skill` không match `/asset-hub/prompt`. **Không** dùng module 104 làm root_mod (table_name NULL, không nằm OWNER_ALL).
