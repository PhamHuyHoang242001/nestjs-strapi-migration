---
phase: 5
title: Verify and docs
status: completed
priority: P2
effort: 1h
dependencies:
  - 4
---

# Phase 5: Verify and docs

## Overview
Full verification across the blast radius, review, docs + deploy checklist.

## Implementation Steps
1. `npx tsc --noEmit -p tsconfig.json`.
2. `npx jest src/modules/coworker src/modules/asset-hub-catalog src/modules/latest-artifacts src/modules/skill-package src/modules/prompt-library src/modules/api-catalog` (reuse-matrix + catalog join coworker tables).
3. Lint changed files via `xargs` (zsh does not word-split `$F`): count must not exceed baseline.
4. Migration up/down on scratch DB with sample coworker data (phase 2 criteria).
5. `code-reviewer` subagent on the diff (focus: migration data safety, URL validation bypasses, leftover `link` reads).
6. Docs: `docs/skill-permission-redesign.md` Coworker section — replace "`link` origin teams" with per-channel link + domain rule; new body/response shape.
7. Deploy checklist (put in PR/commit notes):
   - run migration
   - `UPDATE ai_hub_coworker_channels SET domain = 'https://teams.microsoft.com' WHERE name = 'Microsoft Teams'` (+ Outlook, Zalo rows by user; multiple origins comma-separated, full origin incl. `https://`)
   - deploy BE + FE together.

## Success Criteria
- [ ] tsc clean, all listed suites pass, lint ≤ baseline
- [ ] Reviewer: no critical/high open
- [ ] Docs + checklist updated

## Unresolved
- Non-https deep links (`zalo://`, `msteams:`) → origin `null` → rejected. Confirm with FE/business if needed.
