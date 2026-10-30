# Performance Review — Data Services FE ↔ Data Hub BE

Scope: `src/pages/data-services/**` (diff vs main + untracked files). Perf only.
Measurements: local BE (localhost:3002), current data volume: 160 data services, 46 active consumers, 31 logical terms.
Global QueryClient defaults (`src/index.tsx:12`): `refetchOnWindowFocus:false`, `retry:false`, staleTime 0, gcTime 5 min.

## Verdict on the manual-test observations

| Observation | Verified? | Facts |
|---|---|---|
| Terms page fires both tabs | YES, worse than reported | No `enabled` flag, and both tabs share `search`/`page`/`pageSize`, so **every** keystroke (after the 250 ms debounce) or page click fires 2 list requests. On load: 7 requests, 3 of them unused (source-tables ~5 KB, divisions, departments). The comment at TermsPage.tsx:54 says the opposite of what the code does. |
| Option lists deduped/cached | MOSTLY YES | Keys are shared through `dataHubKeys` (catalog filter, create form, consumer drawer and SourceTermsTable all hit the same cache entry). staleTime: org/permissions 5 min, consumers/logical-options/systems-out 60 s, stats 30 s. Catalog first load = 7 requests (~37 KB; consumers is 21 KB of that because the full consumer rows are fetched only to build a Select). Real waste comes from the blanket `DATA_HUB_KEY` invalidation (see P2-3). |
| fetchAllPages sequential | YES, low impact for options | Options are 46 and 31 rows, so each is 1 request today. It only hurts in `selectAllMatching` (data services, up to 50 sequential RTTs / ~4 MB of full rows just to collect ids). |

## Findings

### HIGH

**H1. Terms page queries the hidden tab, and every interaction doubles the requests**
- `directory/TermsPage.tsx:55-62`, `directory/terms-queries.ts:9-21`
- Both `useLogicalTermsQuery` and `useSourceTablesQuery` always run. `page`, `pageSize` and `search` are shared, so each search or page change refetches the hidden tab too. The hidden tab can also be asked for a page past its last page.
- Impact: 2x BE list load on the busiest dictionary screen (source-tables is the heavier join query: 20 ms vs 8 ms locally). Also a slower first paint.
- Fix: add `enabled: isStandard` / `enabled: !isStandard` (change the hook signatures to accept `enabled`). Also gate `useSystemsOutQuery` to standard mode, and `useDivisionsQuery`/`useDepartmentsQuery` to business mode. Their only consumers are each mode's filter and chips.

**H2. Catalog list has no `placeholderData`: skeleton flash and pagination unmounts on every page or filter change**
- `queries/options.ts:17-22` (catalogQueryOptions), `hooks/useDataServices.ts:68` (`loading: isPending`), `components/DataServicesTable.tsx:53,214`
- Each page, page-size, filter or search change creates a new key. `isPending` is true again, so the grid is replaced by 6 skeleton cards and `DataServicesPagination` is unmounted (`!props.loading`). The layout jumps, the user loses the pager under the cursor, and scroll position collapses. The consumer and terms lists already use `keepPreviousData`, so the main catalog is the odd one out.
- Fix: add `placeholderData: keepPreviousData` to `catalogQueryOptions`. Show a light "refreshing" state with `isFetching && isPlaceholderData` instead of skeletons.
- **Required companion change:** the snap-back effect in `hooks/useDataServices.ts:51-55` must then skip placeholder data (`if (!listQuery.data || listQuery.isPlaceholderData) return;`). Otherwise it computes `lastPage` from the previous filter's total and can push `page` to a wrong value. That would cause an extra request and possibly a second correction pass.

### MEDIUM

**M1. Same flash on the detail-page tabs**
- `queries/options.ts:32-44` (sourceTables, histories); `detail/ServiceTerms.tsx:42`, `detail/ServiceVersionHistory.tsx:27`
- No `keepPreviousData`, so each page or search swaps the table for a skeleton. These two options also don't pass `signal` (`dataServiceEndpoints.sourceTables/histories` don't accept one), so typing in the ServiceTerms search cannot abort in-flight requests.
- Fix: `placeholderData: keepPreviousData`. Add a `signal` parameter to `dataServiceEndpoints.sourceTables/histories` and pass it through.

**M2. Save in the create/edit form refetches about 8 queries that are discarded right away**
- `create/index.tsx:92-97` (same pattern: `directory/ConsumersPage.tsx:207`, `directory/TermForm.tsx:66`)
- `invalidateQueries(DATA_HUB_KEY)` runs before `navigate`. Every active query on the create page refetches, and then the page unmounts: edit-prefill detail, request-units, divisions, writable-departments, consumer options (21 KB), logical options, selectable source tables, users. That is wasted BE load on every save.
- Fix: `client.invalidateQueries({ queryKey: DATA_HUB_KEY, refetchType: 'none' })` and then `navigate(...)`. The destination page refetches its now-stale queries on mount. Or `await client.resetQueries` on the narrower keys only.
- Side note (correctness, out of scope): the success toast uses the page-local `notification.useNotification()` holder (`create/index.tsx:62,169`). The holder unmounts on navigate, so the "Đã tạo dịch vụ" toast likely disappears immediately. Use the static `notification` API or a holder in the layout.

**M3. Blanket `DATA_HUB_KEY` invalidation also clears near-static caches**
- `queries/data-hub-shared-queries.ts:8-19`; mutations in `queries/hooks.ts:27`, `directory/consumer-queries.ts:45`, `directory/terms-queries.ts:56`
- divisions, departments, request-units, my-permissions and the users search all live under `DATA_HUB_KEY`. Any write (even a status toggle) refetches every active one and marks the rest stale. The 5-min org staleTime then does nothing after a write.
- Fix: invalidate with a predicate that excludes org/permissions/users. Or move those keys to a separate root (e.g. `['data-hub-static', ...]`). Keep stats and options in the invalidated set.

**M4. `selectAllMatching` downloads every full row sequentially, and has a race**
- `catalog/use-catalog-export.ts:31-38`, `queries/data-hub-shared-queries.ts:29-37`
- It fetches up to 50 pages x 100 full `DataServiceListItem` rows (~0.8 KB each, so up to ~4 MB), strictly one after another, only to keep `id`. There is no in-flight guard (double click means 2 loops) and no abort. If the user changes the filter mid-flight, the effect at `catalog/view/index.tsx:41` clears the selection. The late `setSelected(ids)` then restores ids from the old filter, and export sends the wrong set.
- Fix: after page 1, use `meta.total` to fire the remaining pages in parallel (bounded concurrency of 4–6). Better: a BE `ids`-only mode, or let export accept "all matching filter" without ids (BE export already takes the filter). Add a pending flag, and drop the result if `filterKey` changed (capture it before the await).
- `fetchAllPages` for option lists: keep it sequential (1 page today). Add an optional `signal` passthrough so unmounts can abort.

### LOW

**L1. Catalog loads all 5 filter-option lists on mount even with the drawer closed**
- `catalog/view/index.tsx:32`, `hooks/useCatalogFilterOptions.ts:27-48`
- About 27 KB / 5 requests per cold catalog visit. They are only needed when the drawer is opened or chips are active. Cached afterwards (60 s / 5 min), so impact is mainly the first visit.
- Fix (optional): `enabled: filterOpen || activeFilterCount > 0`, plus `queryClient.prefetchQuery` on filter-button hover or idle. Same for `ConsumerFilterDrawer.tsx:37-38` (logical options and divisions fire on consumers page load because the drawer component is always mounted).

**L2. Consumer options pull full consumer rows**
- `queries/data-hub-shared-queries.ts:69-74`: 46 rows = 21 KB (avatar, so_apps, division, counts). Only id/code/name are used. Logical terms have a dedicated `/options` endpoint; consumers do not.
- Fix (BE, optional): add `GET /consumers/options` returning `{id, code, name}`. Fine to defer at the current volume.

**L3. DOMPurify sanitize runs on every detail-page render**
- `detail/index.tsx:244`. The page re-renders on tab switch, error modal toggle, status mutation and query updates. A cost of a few ms for typical guides is acceptable.
- Fix: `const guideHtml = useMemo(() => sanitizeGuideHtml(version.usage_guide_html ?? ''), [version.usage_guide_html])`.

**L4. DataHubUserSelect fetches page 1 of users on mount**
- `components/DataHubUserSelect.tsx:34-38`. The 3 pickers share the key, so this is 1 request per form open. It is also under `DATA_HUB_KEY` (see M3).
- Optional: `enabled: open || keyword !== ''`.

**L5. Bundle (pre-existing, not introduced by this diff)**
- `src/App.tsx:9` imports `DataServicesApp` eagerly, and `routes.tsx` imports all screens eagerly. tiptap (create page) is therefore in the initial bundle for every portal user. asset-hub already pulls tiptap and DOMPurify eagerly, so the marginal cost of this diff is about zero.
- The diff **removes** ~21k LOC of fixtures/mock JSON and the `@e965/xlsx` dynamic import. That is a net bundle win.
- Opportunity: `React.lazy` for `create` (tiptap) and `detail`.

## Checked, no issue
- Search inputs debounced (`DataServicesSearchBox` 250 ms; pickers 300 ms). No per-keystroke requests.
- `useDataServices(fixed)`: the only caller (`catalog/view/index.tsx:26`) passes nothing, so the memo deps are stable. ConsumerServicesTab uses its own query instead.
- The catalog view toggle (grid/table) changes the URL but produces an identical query hash, so there is no refetch.
- The snap-back effect cannot loop: it is guarded by `page > lastPage`, and `lastPage >= 1`. It costs at most 1 extra request.
- Object URL revoked after download (`data-hub-http-client.ts:121`). The debounce timers are cleared on unmount.
- Consumer detail and service detail tabs render conditionally, so only the active tab queries.
- Shared option keys are reused across catalog, create, consumer drawer and SourceTermsTable, so there are no duplicate keys for the same data.

## Unresolved questions
1. Should the catalog show skeletons on the first load only, with an inline spinner for later loads? This is a UX call that goes with H2.
2. Is a BE `consumers/options` endpoint and/or an ids-only data-services list acceptable? This affects L2 and M4.
