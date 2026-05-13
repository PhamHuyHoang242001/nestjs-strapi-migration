# Phase 3 — Verify Compile & Manual Test

## Overview
- **Priority:** P2
- **Status:** pending
- **Effort:** 0.5h

## Implementation Steps

### Step 1: Compile check

```bash
npx tsc --noEmit
```

### Step 2: Manual API test

```bash
# Start dev server
npm run start:dev

# Test ALL download
curl -o test.xlsx "http://localhost:3000/admin/diagnostic/report/download?download_type=ALL&isDeleted=false" \
  -H "Authorization: Bearer <token>"

# Test MULTIPLE download
curl -o test2.xlsx "http://localhost:3000/admin/diagnostic/report/download?download_type=MULTIPLE&ids=1,2,3&isDeleted=false" \
  -H "Authorization: Bearer <token>"
```

Verify:
- File is valid .xlsx (opens in Excel/LibreOffice)
- Header row matches column labels
- Data rows contain correct values
- Filename format: `Diagnostic_Reports_DD-MM-YYYY_HHmm.xlsx`
- Empty result (no permission) returns empty Excel, not error

### Step 3: Edge cases

- No accessible reports → empty sheet with headers only
- Invalid download_type → 400 BadRequest
- MULTIPLE with no ids → 400 BadRequest

## Success Criteria
- [ ] TypeScript compiles without errors
- [ ] Excel file downloads and opens correctly
- [ ] ALL and MULTIPLE modes work
- [ ] Edge cases handled gracefully
