---
phase: 5
title: Verify with test users and docs
status: completed
priority: P2
effort: 4h
dependencies:
  - 1
  - 2
  - 3
  - 4
---

# Phase 5: Verify with test users and docs

## Overview
Prove the rules end-to-end with real tokens for non-admin users, then update contracts/docs.

## Requirements
- Test users (script `src/scripts/seed-data-hub-permission-test-users.ts`, modelled on `scripts/seed-skill-test-users.ts`): roles
  - `dh_ds_creator` (dh_data_service_create) → user A, member of DPD.
  - `dh_ds_editor` (dh_data_service_update) → user B, member of DPD + DCR.
  - `dh_dict_editor` (logical/physical create+update) → user C, no department.
  - `dh_dept_admin` (department view/create/update/delete) → user D.
  - user E: no Data Hub roles.
  Passwords/credentials only in seed script / existing dev-login memory, never in chat or docs.
- Invalidate permission cache for those users after seeding (`PermissionCacheService.invalidateUser`).

## Implementation Steps
1. Seed users/roles; login to get tokens (`/auth/login`, device header omitted).
2. Matrix via curl (record status codes):
   - A: create DS in DPD 201, in DCR 403, PUT any 403, writable?create=[DPD], update=[].
   - B: create 403, PUT DPD service 200, move DPD→DCR 200, move to other dept 403.
   - C: logical/physical create/update OK, consumer create 403, physical delete 403, import 403.
   - D: config CRUD OK, members shows A `can_create`, B `can_update`.
   - E: all writes 403, all GETs 200, my-permissions all false.
   - super_admin (no token, dev): everything OK, import OK.
3. Browser check as A and E (token injection per phase 4) and super_admin.
4. Clean up test data rows created during the matrix (soft-delete DS/terms created).
5. Docs: `plans/261023-data-hub-api/api-contract.md` (new section "Permissions" + config APIs + is_update + writable), `docs/codebase-summary.md` Data Hub section.
6. code-reviewer agent on the whole diff.

## Success Criteria
- [ ] Matrix all as expected; full data-hub jest + authorization jest green; tsc + eslint clean.
- [ ] Docs updated; no credentials committed.

## Risk Assessment
- Redis cache stale after role seeding → invalidate or wait 300s.
- Login flow quirks (A007 on bad creds, device header JSON) — see dev-login memory.
