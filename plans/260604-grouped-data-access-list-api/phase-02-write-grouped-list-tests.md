---
phase: 2
title: Write Grouped List Tests
status: completed
priority: P2
effort: 1.5h
dependencies:
  - 1
---

# Phase 2: Write Grouped List Tests

## Overview

Write tests for the NEW grouped `list()` behavior. These tests define the target contract — they will FAIL until Phase 3 implements the logic. This is the core TDD step.

## Requirements

- Functional: Test grouped response shape, group-level pagination, batch record names, all filters
- Non-functional: Tests define the API contract for the new response format

## Architecture

Same test file from Phase 1. Add new `describe` block for grouped behavior. Mock `DataSource.query()` to return:
- Step 1 results: count + paginated groups `[{data_id, module_id, table_name, module_path, module_name, latest_created_at}]`
- Step 2 results: flattened rules for those groups
- Step 3 results: record names from dynamic tables

## Related Code Files

- Modify: `src/modules/data-access/__tests__/data-access-list.service.spec.ts`
- Read: `src/modules/data-access/data-access.service.ts`
- Read: `src/modules/data-access/constants/hierarchy-config.ts`

## Implementation Steps

1. Add grouped behavior test block to existing test file
2. Update mock setup to handle multi-call pattern (groups → rules → record names)

### Test Cases

```typescript
describe('DataAccessService.list() — grouped', () => {
  describe('response shape', () => {
    it('returns grouped data with data_id, module_id, module_name, module_path, record_name, table_name, rules[]')
    it('each group.rules contains rule_id, scope_type, subject_type, subject_id, subject_name, permissions, dates')
    it('groups with role subjects have permissions: null')
    it('groups with user subjects have permissions as JSON array')
    it('record_name falls back to "ID: {data_id}" when target record not found')
  })

  describe('pagination', () => {
    it('paginates by group count, not flat row count')
    it('meta.totalItems reflects total distinct (data_id, module_id) pairs')
    it('page=2&limit=5 returns groups 6-10')
    it('returns empty data with totalItems=0 when no groups match')
  })

  describe('filters', () => {
    it('module_id filter restricts groups to that module')
    it('scope_type filter restricts to groups containing rules of that scope')
    it('role_id filter restricts to groups with rules for that role')
    it('user_id filter restricts to groups with rules for that user')
    it('subject_type=role filter restricts to groups with role-based rules')
    it('subject_type=user filter restricts to groups with user-based rules')
  })

  describe('sorting', () => {
    it('sorts groups by MAX(created_at) DESC by default')
    it('custom sort_field and sort_order applied at group level')
  })

  describe('batch record names', () => {
    it('queries each target table once per distinct table_name in page')
    it('uses NAME_COLUMN_MAP to select correct column per table')
    it('handles mixed table_names in same page (bi_hub_reports + ma_tool_documents)')
  })
})
```

3. Mark Phase 1 "[LOCK]" tests with `.skip` or move to separate describe block with comment explaining they verify old behavior

## Success Criteria

- [ ] 20+ test cases written for grouped behavior
- [ ] All grouped tests FAIL (red phase — implementation not done yet)
- [ ] Test cases cover: response shape, pagination, filters, sorting, batch record names
- [ ] Phase 1 lock tests marked as superseded

## Risk Assessment

- Tests must accurately predict the implementation contract — if mock expectations are wrong, tests pass vacuously
- Mitigation: Write assertions on the actual response structure, not just "query was called"
