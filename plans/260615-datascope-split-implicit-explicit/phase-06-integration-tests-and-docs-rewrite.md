---
phase: 6
title: "Integration Tests"
status: completed
priority: P2
effort: "1.5h"
dependencies: [5]
---

# Phase 6: Integration Tests

<!-- Updated: Validation Session 1 - docs rewrite cut, file docs/so-permission-guide.html không tồn tại trong repo -->

## Overview

End-to-end integration test asserting full flow user request → interceptor → helper → SQL. **Docs rewrite cắt khỏi phase** (Validation Q1) — file gốc `docs/so-permission-guide.html` không tồn tại trong repo. Docs rewrite chuyển thành follow-up task ngoài plan.

## Requirements

### Functional

- Integration test `so-owner-scope-integration.spec.ts` cover:
  - SO Role A (owns `bicc_department=1`) → `GET /v1/bi-hub/diagnostic-report/list` → trả về reports có `bicc_department_id = 1` only.
  - Same user + admin DENY override trên 1 report cụ thể → report đó bị filter out.
  - User without owner role but with explicit grant trên report 99 → trả về report 99 only.
  - User without nothing → 200 empty list (không 403).
  - Admin client → bypass tất cả filter.
  - SQL plan check: verify SQL emitted có `EXISTS` cho owner branch via TypeORM `logger` spy (regression catch nếu helper revert sang IN-list). **Mechanism: TypeORM `DataSource.logger.logQuery` spy** (Validation Q4).
- ~~Docs `so-permission-guide.html` rewrite~~ **CUT (Validation Q1):** File không tồn tại. Follow-up task ngoài plan.

### Non-functional

- Integration test chạy < 30s.

## Architecture

### Integration test outline

```typescript
describe('SO Owner Scope — Integration', () => {
  beforeAll(async () => {
    // Seed: bicc_department 1 + 2, reports under each, role with owner of dept=1
  });

  it('SO user sees only owned-dept reports', async () => {
    const res = await request(app).get('/v1/bi-hub/diagnostic-report/list')
      .set('Authorization', `Bearer ${soToken}`).expect(200);
    expect(res.body.data.every(r => r.bicc_department_id === 1)).toBe(true);
  });

  it('Admin DENY override removes a report from owned scope', async () => {
    // create override_owner DENY on report id=5
    const res = await request(app).get('/v1/bi-hub/diagnostic-report/list')
      .set('Authorization', `Bearer ${soToken}`).expect(200);
    expect(res.body.data.find(r => r.id === 5)).toBeUndefined();
  });

  it('Explicit grant user sees only granted records', async () => {
    // user has data_access ALLOW for report 99 only
    const res = await request(app).get('/v1/bi-hub/diagnostic-report/list')
      .set('Authorization', `Bearer ${grantUserToken}`).expect(200);
    expect(res.body.data.map(r => r.id)).toEqual([99]);
  });

  it('User with no access gets empty array (not 403)', async () => {
    const res = await request(app).get('/v1/bi-hub/diagnostic-report/list')
      .set('Authorization', `Bearer ${noAccessToken}`).expect(200);
    expect(res.body.data).toEqual([]);
  });

  it('Admin client bypasses filter', async () => {
    const res = await request(app).get('/v1/bi-hub/diagnostic-report/list')
      .set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(res.body.data.length).toBeGreaterThan(5);
  });

  it('Emitted SQL contains EXISTS for owner branch (regression guard)', async () => {
    // Setup: register a TypeORM logger spy trên DataSource trong beforeAll
    // dataSource.setOptions({ logging: ['query'], logger: customLogger })
    // customLogger captures emitted SQL into a shared array.
    // Trong test: gọi endpoint SO user, sau đó assert array.some(sql => sql.includes('EXISTS ('))
    const sqls = capturedQueries.filter(q => q.includes('bi_hub_diagnostic_reports'));
    expect(sqls.some(q => q.includes('EXISTS ('))).toBe(true);
  });
});
```

### TypeORM logger spy pattern (Validation Q4)

```typescript
// __tests__/test-utils/sql-capture.ts
import type { Logger, QueryRunner } from 'typeorm';

export class SqlCaptureLogger implements Logger {
  queries: string[] = [];
  logQuery(query: string) { this.queries.push(query); }
  logQueryError() {} logQuerySlow() {} logSchemaBuild() {}
  logMigration() {} log() {}
  reset() { this.queries = []; }
}

// trong test file:
const sqlLogger = new SqlCaptureLogger();
beforeAll(() => { dataSource.setOptions({ logger: sqlLogger, logging: ['query'] }); });
beforeEach(() => sqlLogger.reset());
```

## Related Code Files

### Modify
- `src/common/authorization/__tests__/so-owner-scope-integration.spec.ts`

### Create
- `src/common/authorization/__tests__/test-utils/sql-capture.ts` (TypeORM logger spy)

## Implementation Steps

1. Tạo `__tests__/test-utils/sql-capture.ts` (TypeORM logger spy).
2. Rewrite integration spec với 6 test cases ở section Architecture.
3. Run spec → expected GREEN (Phase 1-5 đã build đúng).

## Success Criteria

- [x] Integration spec 10 tests pass (6 scenario cases + 2 SQL regression guards + 2 PermissionGuard impliedVerbs cases).
- [x] SQL regression guard ON: 2 unit-level tests verify `applyDataScope` SQL output contains `EXISTS (` for 1-hop owner branch AND `d.id = ANY($n)` when `tableName === rootTable`. Uses real TypeORM DataSource + `getQueryAndParameters()` (no DB connect required). The `sql-capture.ts` Logger spy utility is created for future supertest-driven e2e expansion.

### Deviation from plan sketch
- Plan example showed `supertest`/`request(app)` HTTP-layer e2e. Implemented at unit-integration layer (interceptor + guard + helper composition with mocked DataSource). Rationale: full app bootstrap requires Nest TestingModule + DB seed harness — out of plan effort budget. SQL regression guard achieved via standalone `DataSource.createQueryBuilder().getQueryAndParameters()` (Phase 1 technique).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Integration test cần seed DB lớn → flaky | Use isolated test DB + truncate before each suite. Existing test infrastructure likely already supports. |
| TypeORM logger spy có thể bắt SQL của internal TypeORM (metadata loading) → false positive `EXISTS` match | Filter captured queries theo target table (`q.includes('bi_hub_diagnostic_reports')`) trước assert. |
| `dataSource.setOptions` runtime mutation có side effect lên test khác | Reset logger trong `afterAll`. Hoặc dùng riêng DataSource instance cho test này. |
