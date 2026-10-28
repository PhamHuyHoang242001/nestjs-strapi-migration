---
phase: 2
title: Data service write with source tables and terms
status: completed
priority: P1
effort: ''
dependencies:
  - 1
---

# Phase 2: Data service write with source tables and terms

## Overview
DTO `source_tables[]`; write service upserts tables + terms inside the service transaction (after department check), soft-deletes dropped terms, links current terms to the new version, logical history for affected mapped terms, diff labels `table.code`.

Contract and decisions: see plan.md.

## Success Criteria
- [ ] specs: create/update/move/delete terms, scope rules, duplicates, conflicts
- [ ] existing DS specs green
