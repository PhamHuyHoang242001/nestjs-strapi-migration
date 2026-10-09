---
title: AI Hub coworker + supporters + per-WS SO
description: >-
  Coworker clone prompt; bảng ai_hub_supporters; SO own-all từng WS; siết
  edit/approve/status 4 workspace.
status: completed
priority: P2
effort: 4d
branch: main
tags:
  - feature
  - backend
  - api
  - auth
  - ai-hub
blockedBy: []
blocks: []
created: '2026-10-09'
createdBy: 'ck:plan'
source: skill
---

# AI Hub coworker + supporters + per-WS SO

## Overview

Mode `--tdd`. Design: [brainstorm-summary.md](./brainstorm-summary.md).

Coworker = workspace 4, flow prompt (package + version pending/approve, 1 pending). Cắt ngang 4 WS: supporters chung, SO own-all từng WS, siết quyền (approver không bump / không sửa pending).

JSON PIC hiện vẫn `responsible_user_ids` (không rename trong plan này). Field mới: `supporter_ids` write, `supporters: {id,email}[]` read.

## Key decisions

- 2 code/WS: `*_upload` + `*_approve`. Coworker: `coworker_upload` / `coworker_approve`.
- Tạo: upload ∨ SO. Bump / rejected newest: `(created_by ∨ supporter) ∧ upload`. Pending: **chỉ SO**. Approve: approve ∨ SO. Toggle: creator ∨ supporter ∨ SO.
- Supporter ≠ tác giả. Bảng `ai_hub_supporters` (`data_id`, `type`, `user_id`). Full-replace trên create/bump/`editVersion` — **không** PATCH riêng.
- Coworker: không usage_guide/tags/category. `code` user nhập, unique live, immutable, cột package. Channel/model seed + GET. Link domain = const BE.
- SO: 4 module con path **unique** (`/asset-hub/skill` …). Module 104 **giữ `table_name` NULL**. `ROOT_OWNER_CONFIG` + sentinel `resource_id=0`. **Không** `HIERARCHY_MAP` / `OWNER_ALL_TABLES` / `RULE_TARGET_TABLES` (tránh records browser). Helper `isAiHubWorkspaceSO` = `getUserOwnerScope` (`rootId===0`). **Cấm** `isInOwnedScope`. Implied codes allowlist: `upload`+`approve` only.
- Route coworker: `/v1/ai-hub/coworker`.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Supporters table and canBump helper](./phase-01-supporters-table-and-canbump-helper.md) | Completed |
| 2 | [Tighten 3 WS edit approve status](./phase-02-tighten-3-ws-edit-approve-status.md) | Completed |
| 3 | [SO child modules and implied verbs](./phase-03-so-child-modules-and-implied-verbs.md) | Completed |
| 4 | [Coworker schema and lookup GET](./phase-04-coworker-schema-and-lookup-get.md) | Completed |
| 5 | [Coworker APIs clone prompt](./phase-05-coworker-apis-clone-prompt.md) | Completed |
| 6 | [Stats picker seed docs](./phase-06-stats-picker-seed-docs.md) | Completed |

TDD mỗi phase: **red specs → green impl → lint/typecheck**. **Phase 2+3 ship cùng deploy** — không 403 pending trên 3 WS live trước khi SO helper sẵn.

## Global acceptance

1. User upload, không phải creator/supporter → 403 bump + 403 edit rejected.
2. Supporter + upload → bump OK; supporter không upload → 403 dù được gắn.
3. Approver không bump, không `PUT` pending.
4. SO (sentinel) tạo được, `PUT` pending được, approve/toggle được; **403 bump** package người khác.
5. Coworker POST mã trùng → 409; link origin ≠ Teams → 400; `code` không có trên bump DTO.
6. `supporter_ids` trên create/bump/editVersion replace ngay (không chờ approve), max 20.
7. GET channels/models từ seed; không CRUD.

## Out of scope

3 code create/edit/approve. CRUD channel/model. Đổi mã. Gộp author=supporter. Data-access rule trên package AI Hub. FE.

## Cross-plan

Unfinished plans = bi-payment / diagnostic / data-self-serve — **không overlap**. `blockedBy: []`.

## Unresolved (đã chốt brainstorm)

Không còn. Cook theo summary + red team.

## Red Team Review

### Session — 2026-10-09
**Findings:** 15 (14 accepted, 1 rejected — không tách Approach C)
**Severity breakdown:** 5 Critical, 9 High, 1 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Child path `/asset-hub` LIKE sibling perms | Critical | Accept | Completed |
| 2 | HIERARCHY_MAP = records browser; coworker table trước CREATE | Critical | Accept | In Progress |
| 3 | Phase 2 pending blackout trước SO | Critical | Accept | Phase 2–3 |
| 4 | SO pending đổi supporter_ids deputize bump | Critical | Accept | Phase 3, 5 |
| 5 | assertUsers([]) 400 | Critical | Accept | Phase 1–2 |
| 6 | Query không fold SO/supporter | High | Accept | Phase 2–3 |
| 7 | toggle predicate mâu thuẫn | High | Accept | Phase 2–3 |
| 8 | Soft-delete supporter vs PIC hard-delete | High | Accept | Phase 1 |
| 9 | Skill zip I/O trước canBump | High | Accept | Phase 2 |
| 10 | AssetHubWorkspace coworker quá sớm | High | Accept | Phase 1, 5 |
| 11 | permission module_id không down() | High | Accept | Phase 3 |
| 12 | saveOwnerAssignments full-replace | High | Accept | Phase 3 |
| 13 | Unique pending/code thiếu dual-column | High | Accept | Phase 4 |
| 14 | Clone prompt ghi đè code; picker lệch phase | High | Accept | Phase 5–6 |
| 15 | Implied verb allowlist upload+approve | Medium | Accept | Phase 3 |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01…06
- Decision deltas checked: 8 (no HIERARCHY_MAP, merge 2+3 deploy, assertSupporterUsers, SO pending no supporters, query helper, hard-delete supporters, unique child paths, field matrix)
- Reconciled stale references: phase-03 HIERARCHY_MAP / OWNER_ALL; phase-02 pending 403-all; phase-01 AssetHubWorkspace coworker
- Unresolved contradictions: 0
