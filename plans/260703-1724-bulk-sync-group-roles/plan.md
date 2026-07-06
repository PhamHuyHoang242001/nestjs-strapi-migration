---
title: Bulk Sync Group-Roles API (super_admin)
description: ''
status: completed
priority: P2
branch: main
tags: []
blockedBy: []
blocks: []
created: '2026-07-03T10:24:38.689Z'
createdBy: 'ck:plan'
source: skill
---

# Bulk Sync Group-Roles API (super_admin)

## Overview

Super_admin-only API `POST v1/role/sync-group-roles`. Reads a new source table `group_role_mappings` (columns: `type`, `group_role`, `email_user`), groups rows by `group_role`, and for each group: creates the role if missing (or syncs a fixed permission set if it exists), then attaches the mapped users. Users resolved by email `lower(email_user)+'@vpbank.com.vn'`. Missing users / missing permission codes are skipped and returned in a JSON report. No big transaction — best-effort with report (matches skip semantics).

## Key Decisions (locked from brainstorm)

- Source table `group_role_mappings` is **new** (entity + migration); user seeds data.
- User lookup: `email = lower(email_user) + '@vpbank.com.vn'`, match `users.email`. Not found → skip + report.
- Group by `group_role` → 1 role, many users. `role.name = group_role`, `role.code = null`, `type` = metadata only (not used in role).
- Fixed permission codes live in a code constant (placeholder list). Missing code → skip + report.
- Existing role → **add-only** permission sync (add missing perms, never remove existing) + add users.
- User already in role → skipped (reuse existing assignUsers insert-non-existing logic).
- Gate: **inline** `user.type === super_admin` check (403 otherwise); no new guard.
- Domain `@vpbank.com.vn` hard-coded in the same constant file (easy to move to env later — deferred, YAGNI).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Schema & Entity](./phase-01-schema-entity.md) | Completed |
| 2 | [Sync Service & Constants](./phase-02-sync-service-constants.md) | Completed |
| 3 | [API Endpoint & Wiring](./phase-03-api-endpoint-wiring.md) | Completed |
| 4 | [Real-Data E2E Testing](./phase-04-real-data-e2e-testing.md) | Completed |

## Dependencies

<!-- Cross-plan dependencies -->
