# Phase 6 — Index Updates + Build Verify

**Priority:** P1 | **Status:** ⚪ | **Effort:** 30m  
**Depends on:** All previous phases

## Overview

Register all new migration classes in `metadata-index.ts` and `relation-index.ts`, add npm scripts if missing, verify build.

## Files to Modify

- `src/data-migrations/metadata-index.ts`
- `src/data-migrations/relation-index.ts`
- `package.json` (add scripts if missing)

## metadata-index.ts Changes

Add to imports:
```typescript
import { BiHubDiagnosticReportDataMigration } from './metadata/bi-hub-diagnostic-report.data-migration';
import { BiHubDiagnosticFileDataMigration } from './metadata/bi-hub-diagnostic-file.data-migration';
import { BiHubDiagnosticHistoryReportDataMigration } from './metadata/bi-hub-diagnostic-history-report.data-migration';
```

Add to enum:
```typescript
enum TableName {
  BI_HUB_BICC_DEPARTMENT = 'bi_hub_bicc_department',
  BI_HUB_DIAGNOSTIC_REPORT = 'bi_hub_diagnostic_report',
  BI_HUB_DIAGNOSTIC_FILE = 'bi_hub_diagnostic_file',
  BI_HUB_DIAGNOSTIC_HISTORY_REPORT = 'bi_hub_diagnostic_history_report',
}
```

Add switch cases (with `{ }` block + `break`).

## relation-index.ts Changes

Add to imports:
```typescript
import { BiHubDiagnosticReportRelationDataMigration } from './relation/bi-hub-diagnostic-report.data-migration';
import { BiHubDiagnosticHistoryReportRelationDataMigration } from './relation/bi-hub-diagnostic-history-report.data-migration';
```

Add to enum + switch cases. No relation for diagnostic files (no author columns).

## MigrationParams Interface

Both index files already have `MigrationParams` interface — reuse as-is.

## package.json Scripts

Verify these exist, add if missing:
```json
{
  "start:data-migration": "nest build && node dist/src/data-migrations/metadata-index.js",
  "start:relation-migration": "nest build && node dist/src/data-migrations/relation-index.js"
}
```

## Verification

```bash
# Build check
npx tsc --noEmit

# ESLint check
npx eslint src/data-migrations/ --max-warnings=0

# Dry run (should fail gracefully without DB connection)
npm run start:data-migration -- --table_name=bi_hub_diagnostic_report --db_host=localhost --db_port=5432 --db_username=postgres --db_name=eda --db_password=test
```

## Run Commands (add as comments at bottom of index files)

```bash
# Metadata migrations (run in order)
npm run start:data-migration -- --table_name=bi_hub_diagnostic_report --db_host=localhost --db_port=5432 --db_username=postgres --db_name=eda --db_password=123456aA
npm run start:data-migration -- --table_name=bi_hub_diagnostic_file --db_host=localhost --db_port=5432 --db_username=postgres --db_name=eda --db_password=123456aA
npm run start:data-migration -- --table_name=bi_hub_diagnostic_history_report --db_host=localhost --db_port=5432 --db_username=postgres --db_name=eda --db_password=123456aA

# Relation migrations (run after all metadata)
npm run start:relation-migration -- --table_name=bi_hub_diagnostic_report --db_host=localhost --db_port=5432 --db_username=postgres --db_name=eda --db_password=123456aA
npm run start:relation-migration -- --table_name=bi_hub_diagnostic_history_report --db_host=localhost --db_port=5432 --db_username=postgres --db_name=eda --db_password=123456aA
```

## Todo

- [ ] Update metadata-index.ts with 3 new imports + enum + switch cases
- [ ] Update relation-index.ts with 2 new imports + enum + switch cases
- [ ] Add npm scripts if missing
- [ ] `npx tsc --noEmit` passes
- [ ] `npx eslint src/data-migrations/` clean
- [ ] Test run commands documented
