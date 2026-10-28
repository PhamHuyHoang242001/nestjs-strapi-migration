---
phase: 6
title: Seed and mock data import
status: completed
priority: P2
effort: 4h
dependencies:
  - 3
  - 4
  - 5
---

# Phase 6: Seed and mock data import

## Overview
A one-off, idempotent dev script: `src/scripts/seed-data-hub-mock-data.ts`.

Run it with:
```
npx ts-node -r tsconfig-paths/register src/scripts/seed-data-hub-mock-data.ts <mock-folder>/data-exchange/data
```

It is NOT a migration, so production data is not polluted.

## Steps
1. **Org lists** from the mock's hardcoded values:
   - Divisions: EDA, IT, WS_RB, WS_SME, WS_COMM, WS_RISK, WS_FIN, WS_OPS, WS_IT, WS_DGO.
   - Departments: DPD, C360, DWH, DSE, EDA, DPIS, CORE, INFRA, SEC, DF, BI.
   - Request units: the 14 BUs in `create.html`.
2. **Imports** from `data/*.json`:
   - consumers from `subscribers.json`;
   - logical and physical terms from `data-terms.json`;
   - services from `data-services.json`, each as package + version 1 + spec + links, mapping legacy fields to the enums.
3. **Mapping rules:**
   - An unknown enum value maps to the closest value, with a warning count.
   - People are mock usernames, so the script resolves them to `users` by email prefix and otherwise falls back to the script runner's user id (flag `--user-id`).
4. **Idempotency:** upsert by code; a second run changes nothing.
5. Print a summary of counts and warnings.

## Success Criteria
- [ ] Counts match the mock (148 / 42 / 20 / 28, minus documented skips); a re-run is a no-op; the APIs return the data
