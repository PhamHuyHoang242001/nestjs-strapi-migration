---
phase: 1
title: Lock Current List Behavior Tests
status: completed
priority: P2
effort: 1h
dependencies: []
---

# Phase 1: Lock Current List Behavior Tests

## Overview

Write unit tests for the current `list()` method to lock existing behavior before refactoring. These tests mock `DataSource.query()` and verify the SQL generation + response assembly logic. After Phase 3, these tests will be replaced by grouped behavior tests from Phase 2.

## Requirements

- Functional: Test all filter combinations, pagination, sorting, and response shape of current flat list
- Non-functional: Tests must run fast (mocked DB), no real DB dependency

## Architecture

Unit test file mocks `DataSource` (which `list()` uses for raw SQL via `this.connection.query()`). Verify:
- Correct SQL parameters passed for each filter combo
- Pagination meta calculated correctly
- Response shape matches current flat format

## Related Code Files

- Create: `src/modules/data-access/__tests__/data-access-list.service.spec.ts`
- Read: `src/modules/data-access/data-access.service.ts` (lines 66-165, `list()` method)

## Implementation Steps

1. Create test file `src/modules/data-access/__tests__/data-access-list.service.spec.ts`
2. Set up `DataAccessService` with mocked dependencies:
   - Mock `DataSource` with `.query()` spy
   - Mock `DataAccessRepository`, `ModuleEntity` repo, `RoleDataAccess` repo, `UserDataAccess` repo
   - Mock `HierarchyValidationService`, `ChangeHistoryLogger`, `PermissionCacheService`
3. Write tests for `list()`:

### Test Cases (TDD — write all BEFORE Phase 3)

```typescript
describe('DataAccessService.list()', () => {
  // Current flat behavior — these will FAIL after Phase 3 (expected)
  describe('[LOCK] current flat behavior', () => {
    it('returns flat rows with pagination meta')
    it('applies module_id filter')
    it('applies scope_type filter')
    it('applies subject_type=role filter')
    it('applies subject_type=user filter')
    it('applies role_id filter')
    it('applies user_id filter')
    it('applies search filter on data_id and subject_name')
    it('uses default sort: created_at DESC')
    it('uses custom sort when provided')
    it('returns empty data with correct meta when no results')
  })
})
```

4. Verify all tests pass with current implementation

## Success Criteria

- [ ] Test file created with all 11 test cases
- [ ] All tests pass against current `list()` implementation
- [ ] Tests verify SQL parameter passing and response structure
- [ ] `npm test -- data-access-list` runs green

## Risk Assessment

- Low risk — read-only phase, no production code changes
- Mock setup must match actual service constructor signature exactly
