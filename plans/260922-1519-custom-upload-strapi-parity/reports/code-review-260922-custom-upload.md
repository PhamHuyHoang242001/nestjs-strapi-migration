# Code Review — custom-upload (Strapi parity port)

Date: 2026-09-22 · Reviewer: code-reviewer · Scope: `src/common/archive-scan/*`, `src/modules/custom-upload/*`, `src/app.module.ts`, deletion of `src/modules/upload/`

## Verdict

Port logic is faithful to Strapi and the scan is wired at the right place (temp dir first, public only after the scan passes — correct, and better than the original). But the served-URL path is broken (uploaded files are unreachable in a built deploy), and the endpoint has no size/count limit while writing attacker-controlled extensions into an unauthenticated static root. Not ship-ready as-is.

---

## CRITICAL

### C1. Returned `url` 404s in any built deployment — write dir ≠ static-serve dir
- Write: `src/modules/custom-upload/custom-upload.service.ts:19` → `path.resolve('./public/uploads')` = **cwd**-relative = `<root>/public/uploads`.
- Serve: `src/main.ts:104` → `path.join(__dirname, '..', 'public')`.
- Build output is `dist/src/main.js` (verified: `dist/main.js` does not exist), so `__dirname = <root>/dist/src` and the static root is `<root>/dist/public` — **which does not exist**. Every `/uploads/x_ab12cd34ef.pdf` returned by this endpoint is a 404 in a compiled run; it only appears to work under `nest start` from the repo root in some cwd configurations.
- Acceptance criterion 6 (frontend does `res[0].url`) is therefore not actually met end-to-end. Nothing in the test suite catches it — both spec files assert against `UPLOAD_DIR` itself, never against the static root.
- Fix: derive one constant used by both sides, cwd-independent, e.g. export `PUBLIC_ROOT` from a shared config and use it in `main.ts` and the service. Also note `package.json:14 start:prod = node dist/main` points at a nonexistent file — separate pre-existing breakage, but it is the same root cause (outDir contains `src/`).

---

## HIGH

### H2. No size limit, no count limit, whole file read into memory → trivial DoS
- `custom-upload.controller.ts:45` — `FilesInterceptor('files', undefined, { storage: tempStorage })` with **no `limits`** at all.
- Every scanner loads the entire archive into memory synchronously: `archive-scan.util.ts:26` (`new AdmZip(path)` buffers the file), `:41` `fs.readFileSync`, `:69` `fs.readFileSync` into the 7z-wasm virtual FS. A single authenticated user posting N × multi-GB files fills `/tmp`, blocks the event loop (all three reads are sync), and can OOM the process.
- "nginx caps the request body size" (comment at `:44`) is an unverified environmental assumption, not a control in this repo. Add `limits: { fileSize, files }` plus a pre-scan `fs.stat` cap before reading an archive into memory. Streaming the zip central directory (unzipper, as Strapi used) avoids the full buffer for `.zip`.

### H3. Dangerous-but-well-formed extensions still reach an unauthenticated, same-origin static root
- `custom-upload-filename.util.ts:41-47` now sanitizes the extension to `/^\.[a-z0-9]{1,12}$/` — that closes the metacharacter/length vector (good, and it makes M8's `ENAMETOOLONG`/control-char concern moot). It does **not** close this one: `.html`, `.svg`, `.xhtml`, `.js` all match the pattern, and non-archives are not extension-checked (criterion 4, accepted parity). Result: any authenticated user can place `.html` / `.svg` / `.xhtml` under `/uploads/`, which `main.ts:104` serves **inline, with no auth and no `Content-Disposition`**, on the same origin as the API — i.e. stored XSS in the origin that holds the `access_token` / `admin_access_token` cookies.
- I am *not* flagging the missing extension allowlist (per instructions). I am flagging the serving posture, which is this repo's choice, not Strapi's: Strapi's own download path set `Content-Disposition: attachment` (`controllers/custom-upload.ts`).
- Fix (cheap, no parity change): `useStaticAssets(root, { setHeaders: res => { res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Content-Disposition','attachment'); res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox"); } })`.
- Related data-exposure note: anything uploaded here is world-readable to anyone with the URL (40 bits of entropy in the suffix, plus a guessable slug). If any caller uploads confidential documents, that is an authorization gap at the serving layer, not here.

### H4. Partial-batch failure leaves orphaned public files + committed rows
- `custom-upload.service.ts:41-45` — sequential `storeOne` with no transaction. If file 3's `save()` or `rename()` throws, files 1–2 are already in `public/uploads` **and** their media rows are committed, while the client gets a 500 and no handle to them.
- Worse-case: the rename succeeded but the DB insert failed → an unreferenced, publicly-served file with no DB record, undeletable through any admin path.
- Fix: wrap the loop in a transaction (repo already has `typeorm-transactional` initialised at `main.ts`) and, on failure, unlink the destinations written so far in a compensating step.

---

## MEDIUM

### M5. Predictable, world-writable temp directory (symlink / local TOCTOU)
- `custom-upload.controller.ts:20,24` — `os.tmpdir()/custom-upload` created with `mkdirSync(..., {recursive:true})`, i.e. mode `0o777 & ~umask`, at a fully predictable path. On a shared host a local user can pre-create that path as a symlink to a directory they control, or read every uploaded file before it is scanned. Individual file names are UUIDs (good), the directory name is not.
- Fix: `fs.mkdirSync(dir, { recursive: true, mode: 0o700 })`, or per-request `fs.mkdtempSync`.
- Positive: scan and move operate on the same inode (`rename` of the exact scanned path), so there is **no** scan→publish TOCTOU inside the process. That part is right.

### M6. `.rar` path is never exercised against the real library
- `archive-scan.util.spec.ts:115-169` mocks `node-unrar-js` entirely, so the tests assert our own assumption about the API (`getFileList().fileHeaders[].name`, `flags.directory`). If the installed version names these differently, `scanRar` throws → caught at `:49` → returns `false` → **every rar upload is rejected**, and all four rar tests still pass. This is exactly the failure class described for the earlier `new AdmZip()` bug.
- Fix: commit a real `.rar` fixture (generate once with `rar`/`7z a -tr` on any machine, or borrow one from the Strapi repo's fixtures) and assert a true/false pair against it. Until then, treat rar support as unverified.

### M7. Behavioural drift from Strapi in `scanRar` — undocumented
- `archive-scan.util.ts:45` skips headers with `flags.directory`. Strapi's `scanRar` (middlewares/custom-upload.ts ~line 380) did **not** skip directory headers — it ran `isAllowedExt` on every header, so a rar containing folders was rejected. Ours accepts it. The skip is probably the behaviour you want, but the file's doc comments explicitly promise parity and call out the *zip* directory skip only. Document the rar drift in the same comment style, or the next reader will "fix" it back.
- Second, smaller drift: `scan7z` treats any entry name without a dot as a directory (`:85`, parity with Strapi) while `scanZip`/`scanRar` reject extension-less files via `isAllowedExt`. Same archive, different verdict depending on container format. Parity-correct, but worth one line of comment.

### M8. Unhandled filesystem errors surface as 500 mid-batch
- `custom-upload.service.ts:84-92` — `moveFile` rethrows anything that is not `EXDEV`; the result is an unmapped 500 after earlier files in the same batch were already published (see H4). The name-side triggers are now handled by `sanitizeExt` + `slugify` (both outputs are `[a-z0-9_.]` and bounded), so what remains is environmental: `ENOSPC`, `EACCES`, `EROFS`. Map fs errors to a 4xx/5xx with a stable code rather than letting the raw `ErrnoException` reach the exception filter.
- Side effect of the new `sanitizeExt`: an extension longer than 12 chars or containing any non-alphanumeric (`.tar.bz2` is fine → `.bz2`; `.c++` → dropped) stores the file with **no extension**, `mime.lookup('')` then falls back to the client-declared mimetype (`custom-upload.service.ts:77`). Acceptable, but it is a silent drift from Strapi, which preserved the extension verbatim — worth one comment line.
- The EXDEV fallback itself (`:89`) is untested — no spec covers it. It is also non-atomic: `copyFile` to the final public path means a partially-written file is briefly served by the static handler. Copy to `dest + '.part'` then `rename`.

---

## LOW / INFORMATIONAL

- **L9.** `archive-scan.util.ts:41` `Uint8Array.from(fs.readFileSync(...)).buffer` copies the buffer byte-by-byte through an iterator — O(n) allocations on large rars. `new Uint8Array(buf).buffer` or `buf.buffer.slice(...)` is equivalent and far cheaper. (Strapi had the same line; drift here is an improvement, not a regression.)
- **L10.** `scan7z` accumulates every stdout line in memory (`:62`) with no cap; a 7z with a million entries balloons `lines`. Bounded by H2's size limit once added.
- **L11.** Auth is `BearerGuard` only — any authenticated user may upload, no permission code. Matches Strapi's `authUser`; flagging only so it is a conscious choice given the public serving root.
- **L12.** Service specs write into the **real** `public/uploads` (`custom-upload.service.spec.ts` throughout) and clean up only on the success path. A failing assertion leaves stray files in the working tree, and parallel jest workers share the directory. Inject/override `UPLOAD_DIR` via a temp dir in the spec.
- **L13.** A renamed archive (`payload.zip` → `payload.dat`) skips scanning entirely, since dispatch is by `originalname` extension (`:95`). Strapi parity; harmless while nothing extracts server-side, but note it if a future consumer unpacks these files.
- **L14.** Response returns the full saved `Media` entity including `created_by_id`/`updated_by_id`. Low sensitivity, but a DTO would keep the contract explicit (frontend needs `url` only).

## Verified clean

- **Deletion of `src/modules/upload/`**: grepped `src/` and `test/` — zero residual references to `UploadsModule`/`UploadModule`/`modules/upload`. `SkillPackageUploadService` hits are unrelated. `app.module.ts:99` registers `CustomUploadModule`. No regression risk found.
- **Criterion 2/3 (nothing reaches public on rejection)**: the scan runs before `moveAndCreateMedia` and the `finally` sweeps temp (`custom-upload.controller.ts:52-63`). Structurally sound.
- **Criterion 5**: random 10-hex suffix, collision test present and non-vacuous (`custom-upload.service.spec.ts` "never collides").
- **Zip/7z tests are not vacuous**: `valid.zip` and `valid.7z` assert `true` while `has-exe.*` assert `false`, so an always-throwing scanner would fail the positive cases. Good. The rar suite does *not* have this property (M6).
- **Criterion 8**: media row columns match `media.entity.ts`; KB unit conversion is correct and covered.
- Zip-slip / path traversal via archive entry names: N/A — nothing extracts. `ext` cannot contain `/` (`path.extname` operates on the basename), so no traversal via `originalname` either.

## Recommended order

1. C1 (uploads are unreachable — blocks the whole feature).
2. H2 limits, H3 static-serve headers.
3. H4 transaction + compensating unlink.
4. M6 real rar fixture, M5 temp dir mode.
5. M7/M8/L-tier.

## Unresolved questions

- Is nginx (or any proxy) actually enforcing a body-size cap in every environment this deploys to? H2's severity hinges on it.
- Is `dist/src/main.js` the intended build layout, or is `outDir`/`rootDir` misconfigured? The fix for C1 differs (fix the path constant vs. fix the build).
- Does any consumer other than `appDetail.tsx:63` call this endpoint? That determines whether a DTO (L14) can be introduced safely.
