---
title: Skill zip file preview API
description: >-
  GET preview of one utf-8 file inside the active skill package zip; same auth
  as download.
status: completed
priority: P2
effort: 1d
branch: main
tags:
  - feature
  - backend
  - api
blockedBy: []
blocks: []
created: '2026-10-05'
createdBy: 'ck:plan'
source: skill
---

# Skill zip file preview API

## Overview

TDD: `GET /v1/skill/items/:id/files/preview?file=` — unzip active zip, return `{ path, content }`. Auth = `resolveActiveZip`. 404 empty/missing/dir. 400 binary. No HTTP cache. FE cache: `reports/fe-preview-cache-note.md`.

Brainstorm: `./reports/brainstorm-summary.md`

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Failing tests preview+authz TDD](./phase-01-failing-tests-preview-authz-tdd.md) | Completed |
| 2 | [Extract zip entry util](./phase-02-extract-zip-entry-util.md) | Completed |
| 3 | [Wire GET preview + 404/400](./phase-03-wire-get-preview-404-400.md) | Completed |
| 4 | [Regression download/zip](./phase-04-regression-download-zip.md) | Completed |

## Dependencies

None. Reuse `resolveActiveZip`, `downloadZip`, `adm-zip` / zip-slip rules in `skill-zip.util.ts`.
