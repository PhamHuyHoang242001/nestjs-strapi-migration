---
title: "Generic Transform-File Module in Common"
description: "Move transform-file from src/modules/ to src/common/ as shared infrastructure. Each resolver self-manages permission/data-access. Diagnostic is first consumer."
status: pending
priority: P2
effort: 3h
branch: "main"
tags: [transform-file, common, refactor, diagnostic-report]
blockedBy: []
blocks: []
created: "2026-05-18T09:54:53.696Z"
createdBy: "ck:plan"
source: skill
planDir: plans/260518-generic-transform-file-common
---

# Generic Transform-File Module in Common

## Overview

Restructure `transform-file` module from `src/modules/` to `src/common/` as shared infrastructure. Controller drops hardcoded permission decorators. Each domain resolver (starting with diagnostic) self-manages its own permission + data-access checks via `authorize()` method on the `TransformFileResolver` interface. `TransformFileModule` becomes a dynamic module accepting resolvers via `.register()`.

## Context

- Brainstorm: `./reports/brainstorm-summary.md`
- Current location: `src/modules/transform-file/`
- Target location: `src/common/transform-file/` (generic) + `src/modules/bi-hub-diagnostic-report/` (diagnostic-specific)
- URL pattern preserved: `GET /media/transform-file/:id?model=xxx`

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Scaffold common transform-file module](./phase-01-scaffold-common-transform-file-module.md) | Pending | 45m |
| 2 | [Move diagnostic resolver and add self-auth](./phase-02-move-diagnostic-resolver-and-add-self-auth.md) | Pending | 1h |
| 3 | [Wire up app module and update imports](./phase-03-wire-up-app-module-and-update-imports.md) | Pending | 30m |
| 4 | [Update tests](./phase-04-update-tests.md) | Pending | 45m |

## Dependencies

No cross-plan dependencies. Existing diagnostic migration plans are independent.
