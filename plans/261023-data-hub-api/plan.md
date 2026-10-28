---
title: Data Hub API and FE integration
description: >-
  Full REST API for Data Services, data dictionary and consumer apps on the
  data_hub_* schema (package+version for data services), seed from mock data,
  and wire the Mock-EDA-Portal-api-test HTML to it.
status: pending
priority: P1
branch: main
tags:
  - backend
  - api
  - data-hub
  - frontend-integration
blockedBy: []
blocks: []
created: '2026-10-23T04:31:52.681Z'
createdBy: 'ck:plan'
source: skill
---

# Data Hub API and FE integration

## Overview
Replace every piece of mock data in `Mock-EDA-Portal-api-test/data-exchange/` (catalog, detail, create/edit, terms, term-create, business-term-create, consumers, consumer-detail) with real APIs on the `data_hub_*` schema.

**[api-contract.md](./api-contract.md) is the single source of truth for endpoints, shapes and rules.**

## Locked decisions (user, 2026-10-22/23)
- **DB:**
  - Data services use the package + version model, like ai-api-catalog.
  - For now every create/edit is a new version, auto-approved. Review is added later through the API only; no DB change.
  - The `*_histories` change log (JSONB `changes`) is kept alongside versions.
  - Consumers and terms are plain tables with snapshot history; no versioning or approval.
  - SFTP `host` / `folder_path` / `file_name_pattern` / `flow_direction` are nullable.
  - API specs get `sample_request` / `sample_response` (JSONB). The usage guide is stored only as `usage_guide_html` (`usage_guide_markdown` was dropped on 2026-10-23 as unused).
  - User ids are plain INT (no FK). Divisions and departments are independent. Technical lists are VARCHAR + CHECK enums.
- **API:**
  - Scope: full CRUD + history, KPI stats, Excel export, term import (CSV/XLSX).
  - **No permission codes yet.** Bearer auth only.
  - `service_code` = `{API|SFT}-{division code}-{NNN}`.
  - **Security:** select only the columns a response needs; every user reference is returned as `{ id, email }`.
- **Data:** seed org lists and import the mock JSON (148 services, 42 apps, 20 logical / 28 physical terms) for integration testing.
- **FE:** included. The test copy `Mock-EDA-Portal-api-test` (not a git repo) is wired to the API.

## Phases
| Phase | Name | Status |
|-------|------|--------|
| 1 | [DB package-version rework](./phase-01-db-package-version-rework.md) | Completed |
| 2 | [Module skeleton common and lookups](./phase-02-module-skeleton-common-and-lookups.md) | Completed |
| 3 | [Data service API](./phase-03-data-service-api.md) | Completed |
| 4 | [Dictionary API](./phase-04-dictionary-api.md) | Completed |
| 5 | [Consumer API](./phase-05-consumer-api.md) | Completed |
| 6 | [Seed and mock data import](./phase-06-seed-and-mock-data-import.md) | Completed |
| 7 | [FE wiring](./phase-07-fe-wiring.md) | Completed |
| 8 | [Verify review and docs](./phase-08-verify-review-and-docs.md) | Pending |

Phases 3-5 run in parallel after phase 2; each owns its own folder. Phase 6 needs 3-5; phase 7 needs 6.

## Dependencies
- Supersedes the schema in `plans/261022-data-exchange-db-schema` (same migration file `2610221500`, rewritten before any deploy).
- Constraints:
  - no auto-format (`eslint --fix` / prettier);
  - no `typeorm:run` locally (the local DB lacks a migrations table and coworker tables);
  - verify on scratch schemas.
