# Security review — Data Services FE ↔ Data Hub BE (branch feat/data-services-api-integration, uncommitted)

Scope: `src/pages/data-services/**` diff vs main + untracked files. No package.json / webpack changes (dompurify 3.4.13 already a dep; @tiptap/extension-link 2.27.2). Security only.

## Findings

### M1 — Client-side path traversal (CSPT) from route/query ids into BE API paths, incl. write requests
- `create/index.tsx:60,72-73,90` — `editId = params.get('id')`; prefill GET is gated by `/^\d+$/` but the **update PUT is not**: `dataServiceEndpoints.update(editId, …)` (`api/data-service-endpoints.ts:34`).
- `directory/TermForm.tsx:26` → `terms-queries.ts:25,55` → `GET/PUT /logical-terms/${id}` (`api/dictionary-endpoints.ts:36,42`).
- `directory/ConsumerDetail.tsx:20` → `consumer-queries.ts:18,31,38` → `GET /consumers/${id}`, `/source-tables`, `/histories`.
- `directory/PhysicalTermDetail.tsx:13` → `GET /physical-terms/${id}`.
- Verified: react-router 6.28.1 decodes params incl. `%2F`→`/` (`@remix-run/router/dist/router.js:811,865`); `useSearchParams().get` decodes too. Browser URL parser resolves `../` in the axios URL.
- Exploit: attacker sends `…/data-services/catalog/create?id=../../asset-hub/x%3Fa%3D` (or `…/terms/..%2F..%2F<path>/edit`). Victim fills the form/hits Save → `PUT http://<be>/api/v1/<attacker-chosen path>` with victim's Authorization header and a victim-authored body. Detail pages make attacker-chosen authenticated GETs (`?` injection via `%3F` also works). Same-origin only (cannot leak token cross-origin), victim's own privileges, but it turns a link into requests the user never intended. Note `create` with a non-numeric id also silently shows an empty "edit" form.
- Fix: validate once at the boundary and pass numbers only, e.g. a shared `parseId = (v) => /^[1-9]\d*$/.test(v ?? '') ? Number(v) : null`; render not-found when null (as `detail/index.tsx:21-31` already does); type endpoint ids as `number` (drop `| string`) so this is enforced by tsc; optionally `encodeURIComponent` path segments in endpoint files.

### M2 — Hard-coded `DATA_HUB_DEV_TOKEN` has no production guard (design accepted; risk assessment)
- `api/data-hub-http-client.ts:16,56-58`.
- Current state (`''`) fails closed in prod: BE dev bypass only when `NODE_ENV==='development'` and no header (`base-be-ts-sql/src/common/guards/bearer.guard.ts:30`), so prod gets 401s. Risk is the documented workflow "paste a login token here": if that edit is committed/built, the token is (a) in git history and (b) shipped in the public JS bundle → every visitor of the portal (and anyone who downloads the bundle) acts as that user for the token's lifetime; dev tokens are typically super_admin.
- Guard (keep the decision, add a fence):
  ```ts
  const DEV_TOKEN = ''; // chỉ dùng local
  export const DATA_HUB_DEV_TOKEN = process.env.NODE_ENV === 'production' ? '' : DEV_TOKEN;
  ```
  (webpack `mode: 'production'` in `webpack.config.prod.js:19` defines NODE_ENV, Terser drops the dead literal) **plus** a build/CI fail-fast: in `webpack.config.prod.js` read the file and `throw` if `/DEV_TOKEN = '[^']+'/` matches, or a pre-commit grep. Better long-term: read from an untracked `.env.local` (`DATA_HUB_DEV_TOKEN`) via DefinePlugin in dev config only.

### L1 — `DATA_HUB_API_URL` silently falls back to `http://localhost:3002/api` in production builds
- `api/data-hub-http-client.ts:15`. Prod config uses dotenv-webpack 8.1.0; no `DATA_HUB_API_URL` in the repo `.env` (grep). A prod build without the var points every user's browser to plain-HTTP localhost (mixed content; any local process on :3002 receives requests incl. a token if M2 ever regresses).
- Fix: fallback only when `NODE_ENV !== 'production'`; otherwise throw at build/startup if unset or not `https:`.

### L2 — Usage-guide sanitizer is denylist-based; allows remote images/links and markup beyond the editor schema
- `utils/sanitize-guide-html.ts:7-22`, sink `detail/index.tsx:244`. BE stores `usage_guide_html` raw (`data-hub-data-service-write.service.ts:47`), so content written directly via API (not via TipTap) reaches the sink.
- Verified OK: script/style/iframe/object/embed/form/base forbidden, `style` + on* attrs stripped, javascript:/data:/vbscript: removed on URL attrs, DOMPurify default drops `target` (so no tabnabbing), SVG/MathML handled by DOMPurify 3.4.13. No script-execution XSS found.
- Residual: `<img src="https://attacker/p.png">` (editor has no Image extension, so only via API) → every viewer leaks IP/UA/Referer (internal URL) = tracking; `<a href="https://phish">` opens same tab; `<input>/<button>/<select>` and `id`/`name` attrs allowed → UI spoofing and DOM clobbering of `window.<id>` (SANITIZE_NAMED_PROPS off).
- Fix: allowlist matching the TipTap schema: `ALLOWED_TAGS: ['p','br','h1','h2','h3','h4','strong','b','em','i','u','s','code','pre','blockquote','ul','ol','li','a','span','table','thead','tbody','tr','th','td','colgroup','col','hr']`, `ALLOWED_ATTR: ['href','colspan','rowspan','colwidth']`, `ALLOWED_URI_REGEXP: /^https?:\/\//i`, `USE_PROFILES: { html: true }` (drops SVG/MathML); hook to add `target="_blank" rel="noopener noreferrer"` on `<a>`. Side note (functional): forbidding `style` removes TipTap `Color`/`TextStyle` output (`create/CreateGuideEditor.tsx:45-46`); if colors must survive, allow `style` only on `span` and filter to `color:` via hook. Also recommend BE-side sanitization on write (defense in depth for other consumers of this field).

### L3 — `avatar_url` accepts arbitrary external URLs and FE renders them
- `api/data-hub-http-client.ts:138-142` passes through `http(s)://`, `//host`, `data:`; rendered at `directory/ConsumersPage.tsx:226`, `ConsumerDetail.tsx:77`, `consumer-form-fields.tsx:50`. BE DTO only `@IsString() @MaxLength(2000)` (`update-consumer.dto.ts:46-50`).
- Exploit: any user able to edit a consumer sets `avatar_url: "https://attacker/x.png"` via API → every list viewer's browser beacons to attacker (IP, UA, Referer). `<img>` cannot execute script (svg via img is non-scripting), so no XSS.
- Fix: FE `dataHubMediaUrl` accept only relative paths (`/^\/(?!\/)/`) or the configured BE/media origin; BE validate `avatar_url` against the upload URL pattern.

### L4 — Raw BE error text shown for 5xx
- `api/data-hub-error-messages.ts:44-45` shows `raw` for any status ≠ 0. BE `src/filters/all-exceptions.filter.ts:126-127` returns `exception.message` for non-HTTP errors (e.g. TypeORM `QueryFailedError` → constraint/column/table names) with 500. FE now surfaces that in notifications to end users.
- Fix: for `status >= 500` show generic Vietnamese text (keep raw in `.body` for devs); root fix on BE filter (return SYSTEM_ERROR for non-HttpException).

## Checked, no issue
- No `innerHTML`/`dangerouslySetInnerHTML` other than the sanitized guide; BE strings (names, descriptions, JSON samples, history diffs) rendered as React text. History guide diff is text, not HTML.
- TipTap Link 2.27.2 validates href on parse/render (`isAllowedUri`), protocols http/https; link modal regex `^https?://\S+$`.
- Static external link `catalog/view/index.tsx:59` has `rel="noopener noreferrer"`. No `window.open`, no `location` assignment from params; `navigate` targets use BE numeric ids or constants; `paradigm` param is whitelisted (`create/index.tsx:64`).
- Token never sent cross-origin: all paths are relative constants under baseURL (`rootApi` only `/v1/asset-hub/users`, `/v1/custom-upload`); CSPT cannot change origin. No `withCredentials`, no cookies → CSRF N/A (bearer). No `console.*` logging, no localStorage token use (only sidebar UI state).
- Query params via `URLSearchParams` (`serializeQuery`) — no injection; `?search=` only goes to `keyword`.
- Export: blob → object URL revoked after 2s; filename from Content-Disposition used only as `a.download` (browser sanitizes path separators); BE-controlled. Avatar upload: client type (png/jpeg) + 2 MB check present (UX only; BE `custom-upload` relies on declared mimetype — BE concern, not verified further).

## Unresolved questions
1. Is the BE `/uploads` / media origin the same as the API origin in prod? Determines the exact allowlist for L3.
2. Must TipTap text colors be preserved in the rendered guide? (affects L2 `style` handling)
