---
title: Brainstorm — skill zip file preview API
date: 261005-1819
status: agreed
---

# Problem

FE cần preview 1 file **text** trong zip skill (không phải skill.md). Tránh N unzip/DB hit bằng cache FE.

# Requirements (locked)

| Item | Decision |
|---|---|
| Output | `GET /v1/skill/items/:id/files/preview?file=` |
| `:id` | skill **package** id → zip **active** (`resolveActiveZip`) |
| `file` | path zip_tree (vd `scripts/foo.py`); BE+FE `trim()` |
| Auth | Giống download (Bearer + resolveActiveZip) |
| 404 | empty sau trim, không entry, directory, zip/disk missing |
| 400 | binary / không utf-8 (NUL hoặc decode fail) |
| Body | `{ path, content }` string utf-8 — như skill.md |
| skill.md | BE vẫn unzip+trả được; FE **không** gọi |
| Cache | **Không** HTTP cache BE |
| Scope | BE only. FE = `fe-preview-cache-note.md` |

# Approaches

- **A (chosen):** unzip on demand, 1 query zip url + read disk + adm-zip lookup.
- B: persist mọi text lúc upload — YAGNI.
- C: stream unzipper — zip đã cap 5MB.

# Solution

Controller cạnh `downloadZip`. Service: resolve zip → `downloadZip` → match entry (normalize `/`, reject `..`) → `readAsText` + binary check → JSON.

Reuse zip-bomb caps khi đọc entry (`MAX_ENTRY_UNCOMPRESSED_BYTES`).

# Risks

- Miss cache = unzip mỗi request (FE cache mitigates).
- Path encoding query (`encodeURIComponent` trên FE).
- `zip_tree` null bản cũ: vẫn unzip, lookup entry; không phụ thuộc zip_tree server-side.

# Success

- `?file= scripts/a.py ` (spaces) → content file.
- `?file=` / `dir/` / missing → 404.
- png → 400.
- Inactive package: same 403/404 as download.

# Next

`/ck:plan --tdd` (authz + zip util regression).

# Unresolved

None.
