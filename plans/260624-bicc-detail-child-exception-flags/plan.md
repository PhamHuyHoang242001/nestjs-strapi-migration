---
title: bicc detail flags honor child diagnostic-report exceptions
description: ''
status: completed
priority: P2
branch: main
tags: []
blockedBy: []
blocks: []
created: '2026-06-24T02:12:16.568Z'
createdBy: 'ck:plan'
source: skill
---

# bicc detail flags honor child diagnostic-report exceptions

## Overview

bicc detail (`details()`) returns isCreate/isDownload/isDelete. Currently each flag is resolved only against grants bound to the bicc record (role/user) or SO — child-report `user_data_access`/`role_data_access` exceptions are invisible, so a user who can download/delete a child diagnostic report still sees those flags false.

Fix: isDownload/isDelete also true when the user can act on ≥1 child diagnostic report under the bicc (via user OR role grant, deny subtracted). isCreate stays parent-bound (create = new report under bicc; a child exception must not flip it, else the Create button 403s). Scope: `bi_hub_diagnostic_reports` only.

Source brainstorm: `plans/reports/brainstorm-260624-bicc-detail-child-exception-flags.md`.

## Key Decisions (user-confirmed)
- isCreate: unchanged (parent-bound via `canCreateUnderParent`).
- isDownload/isDelete: `canCreateUnderParent(verb)` OR new child-subtree probe.
- Child grant source: user_data_access + role_data_access, deny subtracted (reuse `getAccessibleRecords`).
- Child table: `bi_hub_diagnostic_reports` only.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Tests-first (failing)](./phase-01-tests-first-failing.md) | Completed |
| 2 | [Implement + regression](./phase-02-implement-regression.md) | Completed |

## Dependencies

None. Additive change (new resolver method + composition in one service). No write/enforcement gate touched. Capability-flags feature already shipped (2026-06-23); this extends it without conflict.
