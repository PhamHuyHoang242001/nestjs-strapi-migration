---
phase: 7
title: FE wiring
status: completed
priority: P2
effort: 1.5d
dependencies:
  - 6
---

# Phase 7: FE wiring

## Overview
Wire `/Users/phamhoang/Documents/project-1/Mock-EDA-Portal-api-test/data-exchange/` (a test copy, not git) to the API. The original `Mock-EDA-Portal` repo is never touched.

## Steps
1. **API client** `data-exchange-api.js`:
   - base URL (default `http://localhost:3002/api`), Bearer token from `localStorage`, and a small login prompt;
   - `fetchJson` with error toasts.
2. **Data store:** `data-exchange-store.js` methods call the API. Remove `normalizeService` fakes, the hardcoded KPIs, and the fake consumer/services fallbacks.
3. **Pages:**
   - **catalog:** list, filters, stats, export
   - **detail:** active version, terms tab, histories and diff modal, status toggle
   - **create/edit:** lookups for selects; user pickers via `/asset-hub/users`; payload per contract B6/B7; add the SFTP host/folder/pattern/direction inputs and a changelog note on edit; drop "Lưu nháp"
   - **terms:** tree, systems filter, export/import, both create pages
   - **consumers:** list, detail, create/edit modals
4. **Dead UI:** keep it hidden; it is not wired.

## Success Criteria
- [ ] Every screen loads real data; create/edit/status round-trips; no console errors; no reads from the `data/*.json` mock
