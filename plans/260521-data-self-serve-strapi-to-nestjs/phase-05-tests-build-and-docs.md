---
phase: 5
title: "Tests Build and Docs"
status: pending
priority: P1
effort: "3h"
dependencies: [2, 3, 4]
---

# Phase 5: Tests Build and Docs

## Overview

Verify migrated behavior and update project docs/changelog if docs files exist.

## Requirements

- Functional: focused tests prove creator-only authorization and core flows.
- Non-functional: build must pass; lint failures unrelated to this plan are reported, not hidden.

## Architecture

Use Jest unit tests around service methods with mocked repositories/adapters. Build validates TypeScript and module wiring.

## Related Code Files

- Create: `src/modules/data-self-serve/data-self-serve.service.spec.ts`
- Create: `src/modules/data-self-serve/data-self-serve-quota.service.spec.ts`
- Create: `src/data-migrations/metadata/data-self-serve-request.data-migration.spec.ts` if practical
- Modify: `docs/project-changelog.md` if present
- Modify: `docs/development-roadmap.md` if present

## Implementation Steps

1. Add service tests for list/detail/create/validate/submit/update.
2. Add quota tests for remaining/decrement paths.
3. Run focused tests.
4. Run `npm run build`.
5. Run lint or report existing unrelated lint failures.
6. Update plan phase statuses.

## Success Criteria

- [ ] Focused tests pass.
- [ ] `npm run build` passes.
- [ ] Plan files reflect completed implementation.
- [ ] Any unresolved external infra gaps are documented.

## Risk Assessment

Repo-wide lint currently has known unrelated failures from prior run; do not rewrite unrelated modules solely to satisfy lint unless required for build.
