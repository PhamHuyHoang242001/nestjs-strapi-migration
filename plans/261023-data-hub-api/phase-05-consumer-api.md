---
phase: 5
title: Consumer API
status: completed
priority: P1
effort: 6h
dependencies:
  - 2
---

# Phase 5: Consumer API

## Overview
Implement contract §D (D1-D8) in `src/modules/data-hub/consumer/` (owned folder) and fill `DataHubConsumerModule`.

## Key points
- `api_count` / `sftp_count` / `term_count` are derived in SQL from the active versions of active data services, batched per page.
- `code` is uppercased and immutable after create.
- Snapshot history on create, update and status (`version_no+1`).

## Tests
- list filters (`connection_type`, `logical_term_ids`)
- 409 on code
- `NO_CHANGES`
- snapshot shape
- user refs

## Success Criteria
- [ ] All D endpoints; tsc / eslint / jest green; verified on a scratch schema
