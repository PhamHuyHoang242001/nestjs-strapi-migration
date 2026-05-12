# Phase 3 — Backward Compatibility & Verification

## Overview
- **Priority:** P2
- **Status:** pending
- **Effort:** 0.5h

Handle existing history records that have old `change_log` format and verify compile + runtime.

## Key Insights

Existing data in DB: `change_log = { action: "created" }` or `{ action: "updated" }`.
New format: `{ change_description, old_data, new_data }`.
`formatHistory()` must handle both formats gracefully — no migration needed.

## Implementation Steps

### Step 1: Handle old format in formatHistory()

```typescript
// In formatHistory():
// Old records may have { action: "created" } instead of { change_description, old_data, new_data }
const changeLog = h.change_log;
const normalizedChangeLog = changeLog?.change_description !== undefined
  ? changeLog
  : {
      change_description: changeLog?.action === 'created' ? 'create_new' : 'update',
      old_data: changeLog?.old_data ?? null,
      new_data: changeLog?.new_data ?? null,
    };
```

Use `normalizedChangeLog` in the return object instead of raw `h.change_log`.

### Step 2: Compile check

```bash
cd nestjs-new/base-be-ts-sql && npx tsc --noEmit
```

### Step 3: Manual API test

```bash
# Start dev server
npm run start:dev

# Test history endpoint
curl "http://localhost:3000/bi-hub/diagnostic-report/history?reportId=1&page=1&limit=5" \
  -H "Authorization: Bearer <token>"
```

Verify response contains:
- `file: { type, url }` or `file: null`
- `updatedBy: { id, email }` or `updatedBy: null`
- `change_log.change_description` is string or array
- `change_log.old_data` / `change_log.new_data` present
- No raw `diagnostic_files_*` flat fields

## Success Criteria
- [ ] Old history records render correctly (backward compat)
- [ ] New create/update actions produce proper change_log
- [ ] TypeScript compiles without errors
- [ ] API response matches target shape from plan.md
