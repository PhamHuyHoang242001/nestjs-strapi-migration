---
phase: 4
title: Dictionary API
status: completed
priority: P1
effort: 1d
dependencies:
  - 2
---

# Phase 4: Dictionary API

## Overview
Implement contract §C (C1-C12) in `src/modules/data-hub/dictionary/` (owned folder) and fill `DataHubDictionaryModule`.

## Key points
- **systems_out:** derived in SQL from data-service tables. Read them with raw SQL (active packages → active version → version_physical_terms / version_consumers); do not import the data-service module.
- **Tree list:** paginate the logical terms, then batch-load their physicals and systems_out.
- **Mapping rules:** a physical can only be mapped to an unmapped term or the same logical term. Every mapping change writes a logical history snapshot (`version_no+1`).
- **Import:**
  - Parse xlsx/csv with exceljs.
  - All-or-nothing in one transaction. On error, return `{ errors:[{row,message}] }`.
  - The template endpoint returns the header-only xlsx.

## Tests
- tree query batching
- mapping conflicts
- import parsing and error rows
- history snapshot content
- bulk upsert (case-insensitive)

## Success Criteria
- [ ] All C endpoints; tsc / eslint / jest green; verified on a scratch schema
