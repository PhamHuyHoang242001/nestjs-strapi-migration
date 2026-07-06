---
phase: 4
title: Real-Data E2E Testing
status: completed
priority: P1
effort: 6h
dependencies:
  - 3
---

# Phase 4: Real-Data E2E Testing

## Overview
Thorough end-to-end tests against a **real Postgres** database (not mocks). Boots the full `AppModule` via the existing e2e harness, seeds real rows into `group_role_mappings` / `users` / `permissions` / `roles`, calls the endpoint over HTTP, and asserts DB state after each scenario. Covers happy path, idempotency, add-only permission sync, skip-missing-user, skip-missing-code, grouping, and the super_admin gate.

## Context
- Codebase has **no real-DB integration harness** for permissions today (perm specs are DB-mocked SQL-shape specs). This phase deliberately uses the **e2e harness** (`test/jest-e2e.json`, `test/app.e2e-spec.ts`) which boots `AppModule` with a real TypeORM connection (env `DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_NAME`). Run against a disposable test DB.
- Run command: `npm run test:e2e`.

## Requirements
- Functional: assert real DB rows in `roles`, `user_roles`, `roles_permissions` after each call; assert HTTP status + report body.
- Non-functional: tests self-seed and self-clean (deterministic, re-runnable); no reliance on pre-existing prod data; isolated test DB.

## Architecture / Harness
- New spec: `test/group-role-sync.e2e-spec.ts`.
- Boot pattern (mirror `test/app.e2e-spec.ts`): `Test.createTestingModule({ imports: [AppModule] })` → `createNestApplication()` → `app.init()`; use `supertest` against `app.getHttpServer()`.
- Auth: endpoint sits behind `BearerGuard`. Two options — pick the one matching how e2e auth is done elsewhere:
  1. Mint a real bearer token for a seeded super_admin user (preferred if a token/login path is available).
  2. Override `BearerGuard` with `.overrideGuard(BearerGuard).useValue({ canActivate: ctx => { ctx.switchToHttp().getRequest().info = { user: seededUser, client: 'admin' }; return true; } })` to inject the seeded user — keeps the real DB, real service, real guards for authz logic.
  - Since the super_admin gate is in the **service** (reads `user.type`), the injected/authenticated user's `type` must be real → seed a real super_admin user row and a real normal user row.
- DB access in test: get `DataSource` from the Nest container (`app.get(DataSource)`) to seed + assert + clean.
- Isolation: wrap each test's seed in a unique prefix (e.g. `E2E_` group_role / emails) and clean up in `afterEach`/`afterAll` by deleting seeded rows (roles, user_roles, roles_permissions, group_role_mappings, users, permissions created by the test).

## Test Scenarios (all against real DB)
1. **Super_admin gate**
   - Normal user (type=user) → `403`. No roles created.
   - Super_admin → `200`.
2. **Happy path — new role**
   - Seed permissions matching `GROUP_ROLE_PERMISSION_CODES` (override the constant to a known code seeded in test, OR seed the real codes). Seed users with emails `hoangph12@vpbank.com.vn` etc. Seed `group_role_mappings`: rows for `G_HH_UH` mapping several `email_user`.
   - Call → assert: role `G_HH_UH` exists (name set, code null), `roles_permissions` has the fixed perm ids, `user_roles` links all found users. Report `rolesCreated=1`, `usersAssigned=N`.
3. **Grouping — multiple rows same group_role**
   - Multiple mapping rows same `group_role`, different `email_user` → exactly ONE role, all users attached.
4. **Idempotency — re-run**
   - Call twice. Second call: `rolesCreated=0`, `rolesUpdated>=1`, `usersSkippedExisting=N`, no duplicate `user_roles` rows, no duplicate `roles_permissions` rows.
5. **Existing role — add-only permission sync**
   - Pre-seed role `G_HH_UH` with an EXTRA permission NOT in the fixed array. Call → assert the extra permission is STILL present AND the fixed perms are added. Nothing removed.
6. **Skip missing user**
   - Mapping references an `email_user` with no matching `users.email`. Call → role created, that email appears in `usersNotFound`, other users still assigned, no crash.
7. **Skip missing permission code**
   - Include a bogus code in the fixed array (or unseed one). Call → `missingPermissionCodes` contains it; existing valid perms still attached; no crash.
8. **Duplicate user rows / dedupe**
   - (If email non-unique) two user rows same email → assign once, no duplicate `user_roles`.
9. **Email derivation**
   - `email_user='HOANGPH12'` (uppercase) resolves to `hoangph12@vpbank.com.vn`.

## Related Code Files
- Create: `test/group-role-sync.e2e-spec.ts`
- Read for pattern: `test/app.e2e-spec.ts`, `test/jest-e2e.json`.
- May need: a small test seeding helper (inline in the spec) using `DataSource`.

## Implementation Steps
1. Add spec skeleton booting `AppModule`; obtain `DataSource` + `supertest` agent.
2. Implement seed/clean helpers keyed by an `E2E_` prefix for deterministic isolation.
3. Decide auth approach (real token vs guard override) matching existing e2e conventions; seed super_admin + normal user.
4. Implement scenarios 1–9; assert BOTH HTTP report and real DB rows (`roles`, `user_roles`, `roles_permissions`).
5. For scenarios needing a controlled permission set, either seed the exact real codes from `GROUP_ROLE_PERMISSION_CODES` or make the constant injectable/overridable for tests (prefer seeding real codes to avoid prod-code test hooks; if constant is hard-coded, seed permission rows with those codes).
6. Run `npm run test:e2e` against a disposable test DB; ensure green + no open handles.
7. Confirm re-running the suite twice is still green (self-clean works).

## Success Criteria
- [ ] `npm run test:e2e` passes all scenarios against a real Postgres.
- [ ] Each scenario asserts real DB state (`roles`, `user_roles`, `roles_permissions`), not just HTTP body.
- [ ] Idempotency proven: second run creates no duplicates.
- [ ] Add-only sync proven: pre-existing extra permission survives.
- [ ] Skip-missing-user and skip-missing-code proven via report + DB.
- [ ] Super_admin gate proven (403 for normal user).
- [ ] Suite self-cleans and is re-runnable (green twice in a row).

## Risk Assessment
- No test DB configured in CI → e2e can't run. Mitigation: document required env (`DB_*`) + a disposable test DB; keep the spec self-seeding so any empty Postgres works.
- Guard-override auth diverges from real bearer flow → less realistic. Mitigation: prefer a real minted token if the login/token path is easily seeded; otherwise document the override keeps real service authz (the actual super_admin gate) intact.
- Test pollution of a shared DB. Mitigation: `E2E_`-prefixed data + afterAll cleanup; never run against prod.
- Hard-coded `GROUP_ROLE_PERMISSION_CODES` makes controlled perm-set tests awkward. Mitigation: seed permission rows matching the real codes; only if that's infeasible, expose the constant for test override.

## Unresolved Questions
- Is there an existing disposable/test Postgres + a seed path for a super_admin bearer token in CI, or should the spec rely solely on guard-override + self-seed? (Affects auth approach in step 3.)
