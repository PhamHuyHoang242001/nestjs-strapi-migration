# Review: correctness & regressions, Data Services FE ↔ Data Hub BE

Scope: `src/pages/data-services/**` + `src/routes/routesStore.ts` (FE repo `Data-services`, uncommitted tree vs `main`).
Method: read all new/changed files; compared request params/bodies with BE DTOs (`src/modules/data-hub/**/dto`); curled real BE responses (list/detail/histories/source-tables/options/users/physical-term/consumer/logical-term) and compared them with `api/data-hub-types.ts`.
Typecheck: `npx tsc --noEmit -p . | grep pages/data-services` gives **0 errors**.

## Summary
The DTO mapping is solid. I found **no Critical issues**. These parts check out:
- `toWriteBody`/`toCreateBody`: only whitelisted keys are sent. Optional blanks are omitted, and the BE stores an omitted field as null, so clearing a field works. `source_tables` is always sent on PUT. `logical_term_id` null means unmap.
- Consumer PUT does not send `code`.
- Enum lists match the BE exactly.
- Catalog URL parsing drops bad ids and enums. Page and limit are in range. The page snap-back runs once and does not loop.
- Every write invalidates `DATA_HUB_KEY`.
- The types in `data-hub-types.ts` match the curled shapes.

## Findings

### High
None.

### Medium
1. **Terms page fetches both tabs on every change.** `directory/TermsPage.tsx:54-62`
   - The comment says "Chỉ query tab đang xem", but `useLogicalTermsQuery` and `useSourceTablesQuery` have no `enabled` flag, so both always run.
   - The inactive tab's query also gets the shared `page`/`limit`/`keyword`.
   - Effect: every keystroke, page change and filter change sends 2 requests, and invalidating `DATA_HUB_KEY` refetches both. On the business tab at page 5, `/logical-terms?page=5` is also called.
   - Fix: add `enabled: isStandard` / `enabled: !isStandard`. This needs an `enabled` param in `terms-queries.ts`.
2. **"Unlink" on an existing source table always fails on save.** `create/SourceTableEditor.tsx:138`
   - The button sets `id: undefined` but keeps `name` = the existing table's name.
   - The BE `resolveTables` treats the row as a NEW table, and `assertNameFree` finds the live table with the same name. Result: **409 SOURCE_TABLE_NAME_EXISTS**. The old table is still live at check time, because `deleteEmptyTables` runs later.
   - Scenario: edit a service, click Unlink, Save. You get an error and cannot save until you rename the table.
   - Fix: clear `name` on unlink (`update(key, { id: undefined, name: '' })`), or remove the button. When unlinking, also consider dropping the `id` of terms moved into the new table (BE allows moves, so this is optional).
3. **Terms screens show UTC timestamps as local time.**
   - Files: `directory/TermForm.tsx:22`, `directory/PhysicalTermDetail.tsx:9`, `directory/term-histories.tsx:8`.
   - `value.replace('T',' ').replace(/\.\d+Z$/,'')` prints the UTC wall clock. Vietnamese users see times 7 hours behind.
   - Other screens use `formatDateTime` (dayjs local), and `consumer-detail-tabs.tsx:17` uses `toLocaleString`, so the same record shows different times on different screens.
   - Fix: use `formatDateTime` from `utils/format-datetime.ts` everywhere.
4. **Edit page spins forever on a non-numeric id.** `create/index.tsx:60-74,108`
   - For `catalog/create?id=abc`: `editing=true`, but the query is disabled (`enabled: /^\d+$/`). In react-query v5 a disabled query with no data stays `isPending=true`.
   - So `loading` is true forever: endless spinner, Save disabled, no error or not-found message.
   - Fix: when `editing && !/^\d+$/.test(editId)`, show the not-found block. Or compute `loading` from `editQuery.isLoading` / `fetchStatus`.

### Low
5. **Bad ids show a load error instead of "not found".**
   - Files: `directory/ConsumerDetail.tsx:20-22`, `directory/TermForm.tsx:26-29`, `directory/PhysicalTermDetail.tsx:13-14`.
   - A non-numeric `:id` is sent to the BE, which returns 400 from `ParseIntPipe`. The page shows "Không thể tải… + Thử lại" instead of "không tìm thấy".
   - Fix: validate `/^\d+$/` and treat a failure as not found, as `detail/index.tsx` already does.
6. **Create/edit success toast never appears.** `create/index.tsx:93-97`
   - `messageApi.success` comes from `notification.useNotification()`, whose holder lives in this page. The `navigate()` right after unmounts the holder, so the "Đã tạo dịch vụ / Mã dịch vụ…" toast is lost.
   - This was already the case on main, so it is not a regression. Fix: use the static `notification.success`, like `TermForm` and `ConsumersPage` do.
7. **Repeating the same validation error shows no notification.** `hooks/useFormNotifications.ts:7-9` + `TermForm.tsx:56-60`, `ConsumerFormDialog`/`ConsumerEditDialog`
   - The effect only fires when the `validation` string changes. Submitting twice with the same error shows nothing the second time (`setError('')` and `setError(msg)` are batched in the same handler).
8. **`NO_CHANGES` is handled inconsistently.**
   - The data-service edit shows it as an info message. Logical-term edit and consumer edit go through `useFormNotifications` and show it as the error "Không thể lưu thông tin".
   - Fix: special-case `error.code === 'NO_CHANGES'`.
9. **Create buttons ignore permissions.**
   - "Tạo Dịch Vụ" (`catalog/view/index.tsx:58`) and "Đăng Ký App" (`directory/ConsumersPage.tsx:84-89`) are always shown. `TermsPage` gates its button on `my-permissions`.
   - A user without permission fills the whole form and then gets a 403. Fix: gate on `permissions.data_service.create` / `permissions.consumer.create`.
10. **Long table names break the table picker.** `create/SourceTableEditor.tsx:36-37`
    - The picker sends `keyword = table.name` (up to 255 characters). The BE caps `keyword` at 250 characters; I confirmed by curl that 252 characters returns 400.
    - With a name longer than 250 characters, the picker shows "Không tải được danh sách bảng nguồn". Fix: `keyword.slice(0, 250)`.
11. **No page snap-back outside the catalog.**
    - `TermsPage`, `ConsumersPage`, `ServiceTerms`, `ServiceVersionHistory`, `consumer-detail-tabs` have no snap-back. With `keepPreviousData`, if `total` shrinks after a write or invalidation while on the last page, the page shows empty and pagination still renders.
    - Only the catalog clamps the page.
12. **"Select all" can be silently truncated or rejected.** `catalog/use-catalog-export.ts:33` + `fetchAllPages` (MAX_PAGES 50)
    - "Select all" stops at 5000 ids without warning.
    - Exporting a few thousand selected ids as a comma-joined GET query can exceed Node's 16 KB header limit (431).
    - Low only because the export buttons are commented out right now.
13. **Data dictionary tab shows the wrong org for shared tables.** `detail/ServiceTerms.tsx:96-97`
    - The "Khối chủ quản / Đơn vị phát hành" columns show the service's division/department for every source table.
    - A shared table reused from another department is labeled with the wrong org. The BE `/data-services/:id/source-tables` does not return table orgs.
    - (Uncertain whether this is intended by design.)

### Dead code / leftovers
- `create/CreateTerms.tsx`: a 1-line re-export of `SourceTableEditor` that nothing imports anymore (`create/index.tsx` imports `./SourceTableEditor` directly).
- `hooks/useDataServices.ts:19`: the `fixed` param is unused; it was meant for consumer detail, which now uses `useConsumerServicesQuery`.
- `LABELS.status.inactive = 'Tạm dừng'` while the catalog filter and chips use 'Ngừng hoạt động'. Cosmetic inconsistency.
- No imports of deleted mocks remain (tsc clean).

## Informational / verified OK
- Old terms with `data_type = null` prefill as `''`. The form then requires the user to fill data_type before saving ANY edit of that service. This matches the BE (`data_type` is required), but users will be surprised.
- Consumers that have become inactive are dropped from the edit form, because the BE detail filters with `activeSql`, so a PUT removes their link. This is BE behavior, not an FE bug.
- `technical_description` is NOT NULL in the entity, so `.trim()` in the validators is safe.

## Unresolved questions
1. For finding 2: should Unlink be kept, with the name cleared and the user forced to rename, or removed?
2. For finding 13: should the service's data dictionary tab show each table's own departments? That needs a BE change.
