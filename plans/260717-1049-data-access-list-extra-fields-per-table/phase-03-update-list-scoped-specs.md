---
phase: 3
title: Update list + scoped specs
status: completed
priority: P2
effort: 1h
dependencies:
  - 2
---

# Phase 3: Update list + scoped specs

## Overview

Patch 2 spec file hiện có: thêm case kiểm `record_extra` khi config bật, mảng rỗng, và field sai cột. Mock `connection.query` theo thứ tự call (count → groups → rules → record-info-per-table) — đã có sẵn pattern `setupGroupedMock`, chỉ thêm cột vào row record và case mới.

## Requirements

- Functional:
  - Case (a): bảng có `EXTRA_FIELDS_MAP` khai báo `['code','status']` → group có `record_extra: {code, status}` đúng value.
  - Case (b): bảng không khai báo (mặc định) → group KHÔNG có key `record_extra`.
  - Case (c): config field sai cột → mock query reject 1 lần cho table đó → group `record_extra` vắng, list 200 OK, các group khác bình thường.
  - Case (d) scoped path: `data-access-list-scoped.spec.ts` — verify `record_extra` cũng hoạt động qua owner-accessible CTE path.
- Non-functional:
  - Không xóa case hiện có; chỉ thêm (additive).
  - Mock `EXTRA_FIELDS_MAP` tạm trong test qua `jest.mock` hoặc gán — vì config là const export, ưu tiên test trực tiếp service behavior khi map có/ không có giá trị.

## Architecture

Test dùng `jest.mock('../constants/hierarchy-config', ...)` hoặc set `EXTRA_FIELDS_MAP[table] = [...]` trong test rồi restore. Ưu tiên cách 2 (mutate + restore) để không phải mock toàn bộ module — ít phá vỡ.

Mock query pattern hiện tại (`setupGroupedMock` dòng 127-152): call thứ 4+ là record-fetch per-table. Mỗi table-row mock cần thêm cột extra nếu table đó khai báo:
```ts
const sampleRecordNames = {
  bi_hub_reports: [{ id: 42, display_name: 'Q2 Revenue Analysis', code: 'RPT-01', status: 'active' }],
  ma_tool_documents: [{ id: 10, display_name: 'Upload Template A' }], // không khai báo → không có extra col
};
```

## Related Code Files

- Modify: `src/modules/data-access/__tests__/data-access-list.service.spec.ts`
- Modify: `src/modules/data-access/__tests__/data-access-list-scoped.spec.ts`

## Implementation Steps

1. Mở `data-access-list.service.spec.ts`.
2. Import `EXTRA_FIELDS_MAP` từ `../constants/hierarchy-config`.
3. Thêm `afterEach` restore config: snapshot `EXTRA_FIELDS_MAP` trước, restore sau (tránh leak giữa test):
   ```ts
   let originalMap: Record<string, string[]>;
   beforeEach(() => { originalMap = { ...EXTRA_FIELDS_MAP }; });
   afterEach(() => { for (const k of Object.keys(EXTRA_FIELDS_MAP)) delete EXTRA_FIELDS_MAP[k]; Object.assign(EXTRA_FIELDS_MAP, originalMap); });
   ```
4. Case (a) — bật config + assert:
   ```ts
   it('returns record_extra with declared fields when EXTRA_FIELDS_MAP has the table', async () => {
     EXTRA_FIELDS_MAP.bi_hub_reports = ['code', 'status'];
     const records = { bi_hub_reports: [{ id: 42, display_name: 'Q2 Revenue Analysis', code: 'RPT-01', status: 'active' }], ma_tool_documents: [{ id: 10, display_name: 'Upload Template A' }] };
     const { service } = setupGroupedMock({ recordNames: records });
     const result = await service.list({}, defaultSort, defaultPagination);
     expect(result.data[0]).toHaveProperty('record_extra', { code: 'RPT-01', status: 'active' });
     expect(result.data[1]).not.toHaveProperty('record_extra'); // ma_tool_documents không khai báo
   });
   ```
5. Case (b) — mặc định (không bật config) → không group nào có `record_extra`. Có thể assert trong case response-shape hiện có (dòng 157) thêm `expect(group).not.toHaveProperty('record_extra')` — additive, không phá.
6. Case (c) — field sai cột → query reject:
   ```ts
   it('falls back gracefully when extra field column missing (per-table catch)', async () => {
     EXTRA_FIELDS_MAP.bi_hub_reports = ['nonexistent_col'];
     const queryMock = jest.fn();
     queryMock.mockResolvedValueOnce([{ total: 2 }]);            // count
     queryMock.mockResolvedValueOnce(sampleGroups);               // groups
     queryMock.mockResolvedValueOnce(sampleRules);                // rules
     queryMock.mockRejectedValueOnce(new Error('column nonexistent_col does not exist')); // bi_hub_reports fetch fails
     queryMock.mockResolvedValueOnce([{ id: 10, display_name: 'Upload Template A' }]);    // ma_tool_documents ok
     const { service } = createMockServiceWith(queryMock); // dùng createMockService hiện có
     const result = await service.list({}, defaultSort, defaultPagination);
     expect(result.data[0]).not.toHaveProperty('record_extra'); // fallback
     expect(result.data[0].record_name).toBe('ID: 42');          // catch → name-only fallback
     expect(result.data[1].record_name).toBe('Upload Template A');
   });
   ```
   **Lưu ý**: verify `createMockService` (dòng 26) dùng được cho custom queryMock — hiện `setupGroupedMock` bọc `createMockService`, có thể tách dùng trực tiếp.
7. Mở `data-access-list-scoped.spec.ts`, thêm 1 case scoped: bật `EXTRA_FIELDS_MAP` cho 1 table, assert `record_extra` xuất hiện qua path scoped (owner CTE). Pattern mock tương tự, chỉ khác setup user/role.
8. Chạy `npm test -- data-access-list` verify pass.

## Success Criteria

- [ ] Case (a) pass: `record_extra` đúng value khi config bật.
- [ ] Case (b) pass: default config → không có key `record_extra` (response-shape case).
- [ ] Case (c) pass: field sai cột → catch, list 200, `record_extra` vắng, các group khác OK.
- [ ] Case (d) scoped pass.
- [ ] Toàn bộ case cũ vẫn pass (additive only).
- [ ] `npm test -- data-access-list` green.

## Risk Assessment

- **Risk**: mutate `EXTRA_FIELDS_MAP` leak giữa test nếu quên restore. **Mitigation**: `beforeEach`/`afterEach` snapshot-restore (bước 3).
- **Risk**: mock thứ tự call thay đổi khi thêm query (vd record-info giờ throw thay vì resolve). **Mitigation**: case (c) mock `mockRejectedValueOnce` đúng vị trí thứ 4.
- **Risk**: scoped spec mock phức tạp hơn. **Mitigation**: chỉ 1 case additive, dùng pattern setup có sẵn.
