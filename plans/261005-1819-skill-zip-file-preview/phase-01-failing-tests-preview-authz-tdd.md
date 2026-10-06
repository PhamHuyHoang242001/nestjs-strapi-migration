---
phase: 1
title: Failing tests preview+authz TDD
status: completed
priority: P2
effort: 3h
dependencies: []
---

# Phase 1: Failing tests preview+authz TDD

## Overview

Spec đỏ: util đọc 1 entry text; service/controller 404/400; perm = download (no RequirePermission).

## Related Code Files

- Create: `src/modules/skill-package/__tests__/skill-zip-preview.util.spec.ts`
- Create: `src/modules/skill-package/__tests__/skill-file-preview.spec.ts`
- Modify: `src/modules/skill-package/__tests__/skill-package-perm.spec.ts` (expect no RequirePermission on preview)

## Implementation Steps

1. Util tests (AdmZip fixture): match trimmed path; `..` / empty / missing / dir → 404-shaped error; NUL byte → 400; happy `scripts/a.py` content.
2. Service tests: mock `resolveActiveZip` + `downloadZip`; inactive other-user same as download spec.
3. Perm spec: preview method has no `RequirePermission`.
4. Run → fail (methods missing). Không implement.

## Success Criteria

- [ ] Specs exist and fail for missing API.
- [ ] No production code this phase.
