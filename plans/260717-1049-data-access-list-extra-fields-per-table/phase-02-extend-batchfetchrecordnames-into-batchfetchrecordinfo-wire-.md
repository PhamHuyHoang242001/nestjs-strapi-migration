---
phase: 2
title: Extend batchFetchRecordNames into batchFetchRecordInfo + wire list()
status: completed
priority: P2
effort: 1.5h
dependencies:
  - 1
---

# Phase 2: Extend batchFetchRecordNames into batchFetchRecordInfo + wire list()

## Overview

Đổi `batchFetchRecordNames` (hiện trả `Map<key,string>` chỉ display name) thành `batchFetchRecordInfo` (trả `Map<key,{record_name, record_extra}>`) bằng cách SELECT rộng thêm các cột từ `getExtraFields(table)`. Cùng 1 query/table (KISS, không thêm round-trip). Wire vào `list()` để mỗi group mang thêm `record_extra`.

## Requirements

- Functional:
  - Mỗi table: SELECT `id`, `<nameCol> as display_name`, thêm mỗi extra field `<field>` (alias = tên cột). Nếu `getExtraFields(table)` rỗng → query như cũ (chỉ id + display_name).
  - Mỗi group trả `record_extra`: object `{field: value}` của các extra field có khai báo. Mảng rỗng / bảng không khai báo → `record_extra` **vắng** (không xuất hiện key).
  - Record soft-deleted / missing: `record_name` fallback `ID: ${id}` (như cũ), `record_extra` vắng (không có row → không có value).
  - Bảng lỗi / field sai cột → catch per-table, group đó `record_extra` vắng, list không crash (mirror `record_path` dòng 203).
- Non-functional:
  - Số query DB không tăng (vẫn 1/table).
  - Backward-compat: client không khai báo config → output y hệt hiện tại (không có `record_extra`).

## Architecture

```
list() (dòng 196)
  └─ batchFetchRecordInfo(groups)  ← thay batchFetchRecordNames
       per table:
         cols = getExtraFields(table)   // [] nếu không khai báo
         SELECT id, "nameCol" AS display_name${cols.length ? `, ${cols.map(c=>`"${c}"`).join(', ')}` : ''}
           FROM "table" WHERE id = ANY($1) AND deleted_at IS NULL AND is_deleted IS NOT TRUE
         → row map: { display_name, [col]: value }
       → Map<`${data_id}-${module_id}`, { record_name, record_extra }>
  list() assemble (dòng 227):
       record_name: info.record_name || `ID: ${id}`
       record_extra: info.record_extra   // undefined khi không có → key vắng
```

Cột extra alias = **tên cột gốc** (đã sanitize), value lấy `row[col]`. TypeORM/pg trả key theo alias thường (lowercase), vì alias = tên cột lowercase nên khớp trực tiếp — không cần transform.

## Related Code Files

- Modify: `src/modules/data-access/data-access.service.ts`
  - `batchFetchRecordNames` (dòng 393-424) → rename `batchFetchRecordInfo`, mở rộng.
  - `list()` (dòng 196, 227-236) — đổi caller + assemble.
  - Import `getExtraFields` từ `./constants/hierarchy-config`.

## Implementation Steps

1. Thêm import ở đầu file: `getExtraFields` vào cùng dòng import `NAME_COLUMN_MAP`/`getNameColumn` hiện có (dòng ~12-19).
2. Rename method `batchFetchRecordNames` → `batchFetchRecordInfo`, đổi return shape:
   ```ts
   private async batchFetchRecordInfo(
     groups: { data_id: number; module_id: number; table_name: string }[],
   ): Promise<Map<string, { record_name: string; record_extra?: Record<string, any> }>> {
     const byTable = new Map<string, { data_id: number; module_id: number }[]>();
     for (const g of groups) {
       if (!g.table_name || !ALLOWED_TABLES.has(g.table_name)) continue;
       const entries = byTable.get(g.table_name) || [];
       entries.push({ data_id: g.data_id, module_id: g.module_id });
       byTable.set(g.table_name, entries);
     }

     const infoMap = new Map<string, { record_name: string; record_extra?: Record<string, any> }>();
     for (const [tableName, entries] of byTable) {
       const nameCol = getNameColumn(tableName);
       const extraCols = getExtraFields(tableName);
       const extraSelect = extraCols.length ? `, ${extraCols.map((c) => `"${c}"`).join(', ')}` : '';
       const ids = entries.map((e) => e.data_id);
       try {
         const rows: any[] = await this.connection.query(
           `SELECT id, "${nameCol}" as display_name${extraSelect} FROM "${tableName}" WHERE id = ANY($1) AND deleted_at IS NULL AND is_deleted IS NOT TRUE`,
           [ids],
         );
         const rowMap = new Map(rows.map((r) => [r.id, r]));
         for (const entry of entries) {
           const row = rowMap.get(entry.data_id);
           if (!row) {
             infoMap.set(`${entry.data_id}-${entry.module_id}`, { record_name: `ID: ${entry.data_id}` });
             continue;
           }
           const record_extra = extraCols.length
             ? Object.fromEntries(extraCols.map((c) => [c, row[c]]))
             : undefined;
           infoMap.set(`${entry.data_id}-${entry.module_id}`, {
             record_name: row.display_name || `ID: ${entry.data_id}`,
             record_extra,
           });
         }
       } catch {
         // Per-table failure (e.g. config field không tồn tại) → fallback: name-only, no extra.
         // List không crash — mirror record_path try/catch (dòng 203).
         for (const entry of entries) {
           infoMap.set(`${entry.data_id}-${entry.module_id}`, { record_name: `ID: ${entry.data_id}` });
         }
       }
     }
     return infoMap;
   }
   ```
3. Đổi caller trong `list()` (dòng ~196):
   ```ts
   const recordInfos = await this.batchFetchRecordInfo(groups);
   ```
4. Đổi assemble (dòng ~227-236): thay `recordNames.get(...)` bằng `recordInfos.get(...)`:
   ```ts
   const data = groups.map((g, i) => {
     const info = recordInfos.get(`${g.data_id}-${g.module_id}`);
     return {
       data_id: g.data_id,
       module_id: g.module_id,
       module_name: g.module_name,
       module_path: g.module_path,
       record_name: info?.record_name || `ID: ${g.data_id}`,
       record_path: recordPaths[i],
       table_name: g.table_name,
       ...(info?.record_extra ? { record_extra: info.record_extra } : {}),
       rules: rulesByGroup.get(`${g.data_id}-${g.module_id}`) || [],
     };
   });
   ```
   - Spread có điều kiện: chỉ thêm key `record_extra` khi tồn tại → mảng rỗng/không khai báo → key vắng.
5. Kiểm tra không còn tham chiếu `batchFetchRecordNames` / `recordNames` cũ (grep trong file).
6. `npm run build` pass.

## Success Criteria

- [ ] `batchFetchRecordInfo` trả map `{record_name, record_extra?}`.
- [ ] Bảng có `EXTRA_FIELDS_MAP` khai báo → `record_extra` xuất hiện với đúng field/value.
- [ ] Bảng không khai báo (hiện toàn bộ) → group không có key `record_extra` (output y hệt cũ + base field).
- [ ] Record missing → `record_name` = `ID: ${id}`, `record_extra` vắng.
- [ ] Field sai cột (config typo) → catch, group `record_extra` vắng, list 200 OK.
- [ ] Số query/table vẫn = 1.
- [ ] `npm run build` pass.

## Risk Assessment

- **Risk**: TypeORM/pg trả alias với case khác → value undefined. **Mitigation**: alias = tên cột lowercase (regex ép `/^[a-z_]+$/`), pg giữ lowercase cho identifier không quote → khớp. Test phase 3 sẽ verify.
- **Risk**: quên xóa `recordNames` cũ → dead code. **Mitigation**: bước 5 grep verify.
- **Risk**: spread conditionals khó đọc. **Mitigation**: comment inline lý do "key vắng khi rỗng".
