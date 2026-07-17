---
phase: 1
title: Add EXTRA_FIELDS_MAP config + getExtraFields helper
status: completed
priority: P2
effort: 30m
dependencies: []
---

# Phase 1: Add EXTRA_FIELDS_MAP config + getExtraFields helper

## Overview

Thêm config object `EXTRA_FIELDS_MAP` (table→field[]) cạnh `NAME_COLUMN_MAP` trong `hierarchy-config.ts` + helper `getExtraFields(tableName)` sanitize tên cột bằng regex. Đây là source-of-truth cho việc chọn extra field; service ở phase 2 sẽ gọi helper này.

## Requirements

- Functional:
  - `EXTRA_FIELDS_MAP: Record<string, string[]>` khai báo theo từng table (key = tên bảng trong `ALLOWED_TABLES`).
  - Bảng không có trong map HOẶC mảng rỗng → `getExtraFields` trả `[]`.
  - Helper lọc field qua regex `/^[a-z_]+$/` (giống `getNameColumn`), loại field lạ → chống SQL injection ở tầng config.
- Non-functional:
  - Không query DB; pure constant + pure function.
  - File vẫn <200 dòng (hiện 139 dòng, thêm ~15 dòng).

## Architecture

```
hierarchy-config.ts
  ├─ NAME_COLUMN_MAP          (hiện có)
  ├─ EXTRA_FIELDS_MAP (MỚI)   { table: [field,...] }
  └─ getExtraFields (MỚI)    sanitize + return []
```
`getExtraFields` mirror pattern `getNameColumn`: cùng regex, cùng fallback an toàn. Dev trust config (không verify `information_schema` — over-engineering cho dev-controlled whitelist).

## Related Code Files

- Modify: `src/modules/data-access/constants/hierarchy-config.ts`

## Implementation Steps

1. Mở `hierarchy-config.ts`, sau `NAME_COLUMN_MAP` (dòng ~90) thêm:
   ```ts
   /** Extra fields to select per table for the data-access list, on top of the
    *  display-name column. Dev-maintained whitelist — empty array or a missing
    *  table means "no extra fields". Field names are sanitized at read time by
    *  getExtraFields() so they are safe to interpolate into SELECT. */
   export const EXTRA_FIELDS_MAP: Record<string, string[]> = {
     // Ví dụ (bỏ comment để bật):
     // bi_hub_reports: ['code', 'status'],
     // bi_payment_documents: ['doc_type', 'amount'],
   };
   ```
2. Thêm helper sau `getNameColumn` (cuối file, dòng ~138):
   ```ts
   /** Sanitized extra-field list for a table. Filters out any field failing the
    *  same /^[a-z_]+$/ regex as getNameColumn so a bad config entry can never
    *  reach the SELECT statement. Returns [] for tables not in the map. */
   export function getExtraFields(tableName: string): string[] {
     return (EXTRA_FIELDS_MAP[tableName] || []).filter((c) => /^[a-z_]+$/.test(c));
   }
   ```
3. (Tùy chọn) Thêm invariant tại khối guard cuối file: `EXTRA_FIELDS_MAP` key ⊆ `ALLOWED_TABLES` — nhưng **KHÔNG** throw (chỉ `console.warn`), vì đây là config dev, không nên sập module-load. Nếu thấy over-engineering → bỏ bước này, giữ KISS.

## Success Criteria

- [ ] `EXTRA_FIELDS_MAP` export, rỗng ban đầu (chưa bật field nào — deploy additive, không thay behavior).
- [ ] `getExtraFields('bi_hub_reports')` trả `[]` khi chưa khai báo; trả `['code','status']` khi khai.
- [ ] `getExtraFields('unknown')` → `[]`.
- [ ] `getExtraFields` lọc field có ký tự lạ (vd `code; DROP`) → `[]`.
- [ ] `npm run build` pass (compile check).

## Risk Assessment

- **Risk**: dev quên sanitize field mới → leak. **Mitigation**: helper sanitize bắt buộc; service (phase 2) chỉ dùng output của helper, không đọc map trực tiếp.
- **Risk**: khai báo field không tồn tại trong DB. **Mitigation**: phase 2 catch per-table, fallback `{}`.
