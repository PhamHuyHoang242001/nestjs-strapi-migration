# Round 2 — UI fixes (user list of 22 items), shared rules

FE repo: `/Users/phamhoang/Documents/project-1/Data-services`, branch `feat/data-services-api-integration` (uncommitted work already integrated with the Data Hub BE — keep it working). Module `src/pages/data-services/`.
Context of the integration: `plans/261030-data-services-fe-api-integration/shared-brief.md` (same folder). BE at http://localhost:3002/api (GET via curl ok; don't write data except on test records ZZ_TEST_* / services 173,174 / consumer 52).

Shared constants already added in `constants/index.ts`:
- `CARD_PAGE_SIZE_OPTIONS = [6,9,12,24,48]` (card/grid views), `TABLE_PAGE_SIZE_OPTIONS = [10,20,50,100]` (list/table views). Rule (#18): every paginated list uses 10/20/50/100 when shown as a table/list, 6/9/12/24/48 when shown as cards. When a screen can switch grid↔table, switching resets pageSize to the first option of the new set and page to 1; a URL/state pageSize not in the current set falls back to the first option.
- `DATA_SERVICES_ERROR_CODES_URL` (Confluence link for "Mã lỗi").
`components/DataServicesPagination.tsx` already accepts `pageSizeOptions`.

Confirm-before-save rule (#12): on every EDIT screen (data service edit, logical term edit, consumer edit) clicking the save/confirm button first opens an antd `Modal.confirm` ("Xác nhận lưu thay đổi?", ok "Lưu", cancel "Huỷ"); only on OK submit. Validation errors still show before the popup (don't open the popup if the form is invalid).

Remove ALL download / "Xuất Excel" / export features in your area (#10): buttons, hooks, endpoint calls; delete now-unused code (export endpoints in api/* may be deleted by the lead at the end — don't edit api/* files).

Rules: only edit files you own; never run prettier / eslint --fix / npm run lint|format; keep diffs semantic and match surrounding style; Vietnamese comments explaining why; no plan references in code. Typecheck `cd /Users/phamhoang/Documents/project-1/Data-services && npx tsc --noEmit -p . 2>&1 | grep 'pages/data-services'` must be clean for your files. Don't commit. Report: per item → what changed (file:line), anything not done + why, open questions. End with Status line.
