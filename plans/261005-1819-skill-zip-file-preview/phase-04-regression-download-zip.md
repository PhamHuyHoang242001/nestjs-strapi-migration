---
phase: 4
title: Regression download/zip
status: completed
priority: P2
effort: 1h
dependencies:
  - 3
---

# Phase 4: Regression download/zip

## Overview

Không đổi download / extractSkillZip / upload.

## Implementation Steps

1. `npm test -- --runInBand` :
   - `skill-download.spec.ts`
   - `skill-zip.util.spec.ts`
   - `skill-zip-preview.util.spec.ts`
   - `skill-file-preview.spec.ts`
   - `skill-package-perm.spec.ts`
2. Fix only regressions from this feature.

## Success Criteria

- [ ] All listed suites pass.
- [ ] FE note still accurate vs real route.
