---
phase: 3
title: Wire GET preview + 404/400
status: completed
priority: P2
effort: 3h
dependencies:
  - 2
---

# Phase 3: Wire GET preview + 404/400

## Overview

`GET /v1/skill/items/:id/files/preview` **trước** `items/:id` không conflict (`files` static). Query DTO `file`. Bearer only.

## Implementation Steps

1. DTO `file` string required (whitelist). Empty after trim still 404 in util.
2. Controller: userId → `resolveActiveZip` → `downloadZip` → `readZipTextEntry` → `{ path, content }`.
3. Register static path **before** any greedy param if needed (`items/:id/download` already exists; add `items/:id/files/preview` next to download).
4. Green `skill-file-preview.spec.ts` + perm spec.

## Related Code Files

- Modify: `skill-package.controller.ts`, query service or thin preview method
- Create: dto query file
- Modify: perm spec

## Success Criteria

- [ ] Route + authz reuse download.
- [ ] 404/400 mapping as locked.
