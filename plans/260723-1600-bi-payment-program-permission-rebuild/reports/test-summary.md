# Test Summary

**Plan:** `plans/260723-1600-bi-payment-program-permission-rebuild/`  
**Date:** 2026-07-23  
**Status:** completed

## Scope

Final verification for the BI Payment permission rebuild and its migration guards.

## Results

| Check | Result | Notes |
| --- | --- | --- |
| Jest BI Payment + migration specs | PASS | 20 suites, 167 tests, 0 failed. |
| Full repository Jest | WARN | 65/69 suites and 602/604 tests passed. Four failing suites are outside BI Payment. |
| `git diff --check` | PASS | No whitespace / patch syntax issues. |
| ESLint on changed runtime/migration sources | PASS | Non-test TypeScript touched by the permission rebuild passed with `--max-warnings 0`. |
| ESLint on changed test specs | WARN | Strict lint still reports mock-heavy `unsafe-any`/typing issues; Jest compiles and passes. No autofix was run. |
| repo-wide `tsc` | WARN | Pre-existing unrelated Role property errors remain in `permission-matrix.service.ts`, `role.service.ts`, `users.service.ts`. |
| Scoped coverage | WARN | Test command passed, but reporter emitted unusable `All files 0%`; per-file coverage remains unverified. |
| PostgreSQL live migration smoke | NOT RUN | Deferred cleanup migration was not exercised against a real DB here. |

## Evidence

- Active add migration verified as schema-safe and collision-safe in source.
- Deferred cleanup migration is intentionally outside the active migration glob until the later cleanup release.
- Full-run failures: authorization owner-interceptor assertion, transform-file auth assertion, and two Role suites blocked by the known Role type drift.
- No production rollout or live smoke was performed in this session.

## Unresolved Questions

- Which physical join table is present in the target environment: `role_permissions` or `roles_permissions`.
- When the later cleanup release will be promoted to active migration scope.
