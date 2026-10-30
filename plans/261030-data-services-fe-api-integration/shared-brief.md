# Data Services FE ↔ Data Hub BE integration — shared brief

FE repo: `/Users/phamhoang/Documents/project-1/Data-services` (branch `feat/data-services-api-integration`, React 18 + TS + antd 5 + @tanstack/react-query 5 + webpack). Module: `src/pages/data-services/`.
BE repo: `/Users/phamhoang/Documents/project-1/nestjs-new/base-be-ts-sql` (NestJS). Contract: `plans/261023-data-hub-api/api-contract.md` (read it fully). DTO source of truth: `src/modules/data-hub/**/dto/*.ts`, enums `src/modules/databases/data-hub-enums.ts`.
BE runs at http://localhost:3002/api (dev: no Authorization header → super_admin). `curl` it to check real shapes, e.g. `curl -s 'http://localhost:3002/api/v1/data-hub/data-services?limit=2'`. DO NOT create/modify data via curl except to verify your own flow; do not delete anything.

## Goal
Replace every mock (fixtures JSON, localStorage repositories, hard-coded org/consumer/term/user lists, fake notifications) with the real BE API. Pagination, query params and request bodies must be correct and complete per the BE DTOs.

## User decisions (binding)
1. BE is the source of truth. FE-only fields/features with no BE counterpart are REMOVED from the UI (e.g. logical term name/type/sensitivity/steward/approval status, show/hide term toggle, source-table "mechanism"/fullPath rule, mock notifications, consumer acronym/unit/owner, workflow PENDING_APPROVAL, business-term standalone create).
2. Validation follows BE exactly (consumers 1..20, requester/IT/SO users ≥1 each (≤50), timeout required only when sync_mode=SYNC, max lengths as DTO, consumer code ^[A-Z0-9_]{2,100}$, etc.). Add fields the BE needs that the UI lacks (e.g. service owners, data_type, is_required, changelog note).
3. Auth: fixed dev token constant in `api/data-hub-http-client.ts` (empty → BE dev bypass). Never use the portal `access_token`.
4. Server-side pagination everywhere a BE list is paged: send `page`, `limit` (1..100, BE default 10), `keyword`; read `meta.total`. No client-side slicing/filtering of server data. Filters map to BE query params exactly (arrays are sent comma-joined by the client).

## Foundation already written (use it, don't duplicate; you may ADD to these only if truly missing and tell the lead)
- `api/data-hub-http-client.ts` — `dataHub.get/post/put/patch`, `rootApi`, `downloadDataHubFile`, `dataHubMediaUrl`, `DataHubApiError` (message already Vietnamese + `[RAW CODE]`, `.code`, `.status`).
- `api/data-hub-types.ts` — all BE response/body types.
- `api/data-hub-enums.ts` — enum arrays, `LABELS`, `label()`, `frequencyLabel()`, `labelOptions()`, `API_BASE_URL_HOSTS`.
- `api/data-service-endpoints.ts`, `api/dictionary-endpoints.ts`, `api/consumer-endpoints.ts`, `api/org-endpoints.ts`.
- `queries/data-hub-shared-queries.ts` — `DATA_HUB_KEY` (invalidate after every write), org/stats/permissions/consumer-options/logical-options/systems-out hooks, `fetchAllPages`.
- `components/DataHubUserSelect.tsx` — remote multi user picker, value `{id,email}[]`.
- Routes (already wired in `routes.tsx` / `src/routes/routesStore.ts`; params are numeric BE ids): catalog, `catalog/create` (edit = `catalog/create?id=<id>`), `catalog/:id/detail`, `terms`, `terms/create`, `terms/:id/edit` (logical), `terms/business/:id/detail` (physical, read-only), `consumers`, `consumers/:id/detail`.

## Rules
- Only edit files you own (listed in your task). Do NOT delete legacy shared files (`api/mock*.ts`, `api/directory.*`, `api/fixtures/*`, `directory/queries.ts`, `directory/types.ts`, `types/index.ts` unless you own it, `consumer-seed-meta.ts`, `dictionary-model.ts`, `constants/*`) — just stop importing mocks from your files; the lead deletes leftovers at the end. If you need a shared helper, create a NEW file inside your owned area.
- NEVER run prettier / `eslint --fix` / `npm run lint` / `npm run format` (they reformat the whole repo; the user reviews diffs by hand). Keep diffs semantic, match surrounding style.
- Comments in Vietnamese, explain why, no plan/phase references. Files < ~200 lines where reasonable (split by concern, kebab-case or the folder's existing naming).
- Keep the existing look (classNames/scss); change markup only where fields are added/removed.
- Loading / error / empty states for every query; mutations show antd `notification.error({ message: err.message })` on failure and success notification; after write invalidate `DATA_HUB_KEY` (and navigate as the old mock flow did).
- Typecheck: `cd /Users/phamhoang/Documents/project-1/Data-services && npx tsc --noEmit -p . 2>&1 | grep 'pages/data-services'` → zero errors in your files. The webpack dev server on :3000 hot-reloads; you may open http://localhost:3000/home/data-hub/data-services/... with curl only (no browser tools).
- Do not commit. Report: files changed, what each screen calls (endpoint + params/body), removed features, open questions. End with Status: DONE | DONE_WITH_CONCERNS | BLOCKED.
