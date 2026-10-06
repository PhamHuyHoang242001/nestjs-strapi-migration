---
phase: 2
title: Extract zip entry util
status: completed
priority: P2
effort: 3h
dependencies:
  - 1
---

# Phase 2: Extract zip entry util

## Overview

Green util tests. Pure function trên Buffer + path. Không HTTP.

## Architecture

`readZipTextEntry(buffer, rawPath): { path, content }`

- trim + normalize `\`→`/` + strip leading `/`
- empty / `..` segment → NotFoundException
- parse zip (reuse invalid/bomb checks from extractSkillZip where cheap — at least entry size cap)
- exact path match; directory → 404
- utf-8 no NUL → else BadRequestException
- Do **not** change `extractSkillZip` behavior.

## Related Code Files

- Create: `src/modules/skill-package/skill-zip-preview.util.ts` (keep `skill-zip.util.ts` under 200 if possible — new file)
- Modify: util spec → green

## Success Criteria

- [ ] Util specs green.
- [ ] `skill-zip.util.spec.ts` still green.
