---
title: "Enhance Diagnostic History API — change_log, file, updatedBy"
description: "Add change tracking (change_description, old_data, new_data), file object, and updatedBy to history endpoint response to match Strapi behavior"
status: pending
priority: P1
effort: 3h
branch: main
tags: [diagnostic-report, history, change-log, migration]
blockedBy: []
blocks: []
planDir: plans/260512-1542-enhance-diagnostic-history-api
---

# Plan — Enhance Diagnostic History API

## Context

History endpoint `GET /bi-hub/diagnostic-report/history` returns raw entity without change tracking detail. Strapi stores `change_log` with `{ change_description, old_data, new_data }` and returns `file: {type, url}` + `updatedBy: {id, email}`. NestJS currently stores `change_log: { action: "created"|"updated" }` only.

**Source (Strapi):** `strapiv5-old/src/api/bi-hub-report/services/bi-diagnostic-admin.ts:2731-2810`
**Target (NestJS):** `nestjs-new/base-be-ts-sql/src/modules/bi-hub-diagnostic-report/`

## Response Shape (Target)

```json
{
  "id": 1,
  "name": "Report ABC",
  "code": "BICC_IT_1",
  "version": 3,
  "is_change_link": false,
  "change_log": {
    "change_description": ["name", "summary", "insight"],
    "old_data": { "name": "Old", "summary": "..." },
    "new_data": { "name": "New", "summary": "..." }
  },
  "file": { "type": "POWER_BI", "url": "..." },
  "updatedBy": { "id": 5, "email": "admin@example.com" },
  "created_at": "...",
  "updated_at": "..."
}
```

For `action: "created"` → `change_description: "create_new"`, `old_data: null`, `new_data: {full report}`.

## Files to Modify

| File | Change |
|------|--------|
| `bi-hub-diagnostic-report-write.service.ts` | Rewrite `createHistoryRecord()` — build change_log with diff |
| `bi-hub-diagnostic-report.service.ts` | `findHistory()` — join users table for updatedBy |
| `diagnostic-report-format.helper.ts` | Add `formatHistory()` — shape file + updatedBy |
| `bi-diagnostic-history-report.entity.ts` | Add ManyToOne relation to Users (optional) |

## Phases

| Phase | File | Status | Effort |
|-------|------|--------|--------|
| 1 | [phase-01-change-log-tracking.md](phase-01-change-log-tracking.md) | pending | 1.5h |
| 2 | [phase-02-history-response-format.md](phase-02-history-response-format.md) | pending | 1h |
| 3 | [phase-03-backward-compat-and-test.md](phase-03-backward-compat-and-test.md) | pending | 0.5h |
