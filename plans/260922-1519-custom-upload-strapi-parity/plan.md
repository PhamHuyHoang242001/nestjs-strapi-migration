---
title: Custom Upload API - Strapi Parity
description: >-
  Port POST /custom-upload từ Strapi v5 sang NestJS, giữ nguyên logic quét file
  nén zip/rar/7z
status: completed
priority: P2
branch: main
tags:
  - upload
  - strapi-parity
  - media
blockedBy: []
blocks: []
created: '2026-09-22T08:21:20.959Z'
createdBy: 'ck:plan'
source: skill
---

# Custom Upload API - Strapi Parity

## Overview

Strapi `POST /custom-upload` delegate hết cho core upload plugin; logic riêng duy nhất là middleware `hasAccessFileCompression` — quét **bên trong** `.zip`/`.rar`/`.7z`, từ chối nếu có entry ngoài allowlist 29 đuôi.

Port sang NestJS: 1 endpoint `POST /api/v1/custom-upload`, `BearerGuard`, ghi bảng `media`, lưu file vào `public/uploads`. Không có biến thể `/admin/`, không `folderId`. Size cap 256MB/file (`UPLOAD_MAX_FILE_SIZE`) thêm sau code review.

Nguồn: [brainstorm-summary.md](./reports/brainstorm-summary.md)

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Archive scan util](./phase-01-archive-scan-util.md) | Completed |
| 2 | [Custom upload endpoint](./phase-02-custom-upload-endpoint.md) | Completed |
| 3 | [Media mapping and verify](./phase-03-media-mapping-and-verify.md) | Completed |

## Quyết định đã chốt

| Vấn đề | Chọn | Ghi chú |
|---|---|---|
| Bảng metadata | `media` | Shape Strapi `files`; user đã đổi xong trong lúc cook |
| Scan nén | zip + rar + 7z | Đủ cả 3 như Strapi |
| Route | `POST /custom-upload` | Bỏ `/admin/custom-upload` |
| Guard | `BearerGuard` | Tương đương `authUser` của Strapi |
| Size limit | 256MB/file, env `UPLOAD_MAX_FILE_SIZE` | Thêm sau code review (H2); nginx vẫn chặn tổng body |
| `folderId` | Bỏ hẳn | `media` không có cột folder |
| Tên file | `{slug}_{10 hex}{.ext}` | Hậu tố ngẫu nhiên như Strapi |
| zip lib | `adm-zip` (đã có) | Thay `unzipper`, bớt 1 dep |
| Số file / request | Không giới hạn | Strapi không cap |
| `.zip` lồng `.zip` | Từ chối | Hệ quả allowlist không chứa `.zip` |

## Dependencies

**Chặn phase 3:** schema `media` mới của user. Phase 1-2 chạy được ngay, không phụ thuộc.

**Package cần thêm:** `node-unrar-js`, `7z-wasm`, `@types/multer`, `mime-types` (runtime — hiện chỉ có `@types/mime-types`).

**Không chồng lấn plan nào khác** — đã quét toàn bộ `plans/*/plan.md` với `custom-upload` / `media.entity` / `modules/upload`, không ra kết quả.

## Validation Log

### Session 1 — 2026-09-22

**Verification Results**
- Tier: Standard (3 phases → Fact Checker + Contract Verifier)
- Claims checked: 12 | Verified: 10 | Failed: 2 | Unverified: 0

> Lưu ý: `ck plan check` quét toàn file và ghi đè bất kỳ ô bảng nào trông giống cột status,
> nên bảng này từng bị nó thay chữ. Kết quả dưới đây dùng ký hiệu ✅/❌ thay cho chữ
> "VERIFIED"/"FAILED" để CLI không nhận nhầm lần nữa.

| # | Claim | Kết quả |
|---|---|---|
| 1 | `adm-zip` có sẵn trong deps | ✅ `^0.6.0`, cài thật 0.6.0, `getEntries()` tồn tại |
| 2 | `validateArchive` được gọi lại ngoài middleware | ✅ nhưng **sai dòng** — thật là `bi-payment-comment.ts:26,72` + `new/services/new.ts:23,55` (plan ghi 65,75 / 48,58) |
| 3 | `main.ts:104` serve `public/` không guard | ✅ |
| 4 | `TransformInterceptor` bọc response | ❌ **SAI** — `transform.interceptor.ts:17` là no-op passthrough, không bọc gì |
| 5 | Route `/custom-upload` không cần prefix `v1/` | ❌ **SAI** — FE gọi `/api/v1/custom-upload` (`EDA_FE/src/utils/env.ts:3`), prefix `api` (`main.ts:43`) → controller phải là `@Controller('v1')`, nếu không sẽ 404 |
| 6 | FE đọc `res[0].url` | ✅ `appDetail.tsx:63` |
| 7 | FE gửi field `files` | ✅ `appDetail.tsx:55` |
| 8 | `mime-types` thiếu bản runtime | ✅ |
| 9 | Middleware Strapi :17-55, :281-318, :321-451 | ✅ |
| 10 | 2 hàm public ngữ nghĩa ngược nhau | ✅ `:19` `true` vs `:437` `false` |

Cả 2 FAILED đã sửa trong phase file trước khi phỏng vấn.

**Quyết định phỏng vấn**

| Câu | Trả lời | Ảnh hưởng |
|---|---|---|
| File thường (không nén) có check đuôi? | **Không** — giữ nguyên Strapi | Upload trực tiếp `.exe`/`.sh` vẫn qua. Chấp nhận có ý thức, không phải sót |
| `7z-wasm` không chạy được thì sao? | **Dừng, hỏi user** | Không tự đổi hướng ở phase 1 |
| `/v1/uploads/one|many` là đường vòng bỏ qua scan | **Để nguyên, ngoài scope** | Nợ kỹ thuật đã ghi nhận |

**Khuyến nghị:** proceed. Failed 0 còn lại.

### Whole-Plan Consistency Sweep

Rà lại `plan.md` + 3 phase sau khi sửa:
- Route `v1/` nhất quán ở phase 2 (Architecture + Risk) — không còn chỗ nào ghi "không prefix"
- `AnyFilesInterceptor` đã thay hết bằng `FilesInterceptor('files')` (cả sơ đồ luồng lẫn bước 3)
- `TransformInterceptor` chỉ xuất hiện ở phase 3, đã nêu đúng bản chất no-op
- Số dòng `validateArchive` đã sửa ở phase 1
- Không còn `[UNVERIFIED]`; `folderId` / `/admin/` chỉ còn trong mục Out of scope

**0 mâu thuẫn chưa xử lý.**

## Code Review — 2026-09-22

Báo cáo đầy đủ: [code-review-260922-custom-upload.md](./reports/code-review-260922-custom-upload.md)

### Đã sửa

| Mã | Vấn đề | Cách sửa |
|---|---|---|
| H2 | Không giới hạn dung lượng; 3 scanner đều đọc cả file vào RAM đồng bộ → DoS | `limits.fileSize`, mặc định 256MB, chỉnh qua `UPLOAD_MAX_FILE_SIZE` |
| H4 | Lô nhiều file hỏng giữa chừng → file trước đã publish + row đã commit, client nhận 500 | Ghi nhận destination ngay sau khi move, rollback unlink khi lỗi. Có test |
| M5 | `os.tmpdir()/custom-upload` tạo mode mặc định, path đoán được → symlink/đọc trộm | `mkdirSync(..., { mode: 0o700 })` |
| M7 | `scanRar` bỏ qua entry thư mục, Strapi thì không — không ghi chú | Thêm comment nêu rõ drift |
| M8 | `copyFile` thẳng vào path cuối → serve file ghi dở | Copy ra `.part` rồi `rename` |
| L9 | `Uint8Array.from(buffer)` cấp phát từng byte | `new Uint8Array(buffer)` |
| L12 | Spec ghi vào `public/uploads` thật, worker song song dẫm nhau | `uploadDir` injectable, spec dùng `mkdtemp` |
| — | **Tự tìm thêm:** `ext` lấy nguyên từ client → `x.<script>` chảy vào cột `url` | `sanitizeExt`: chỉ nhận `^\.[a-z0-9]{1,12}$`. Có test |

### Quyết định giữ nguyên

| Mã | Vấn đề | Quyết định của user |
|---|---|---|
| C1 | `main.ts:104` serve `dist/public` (không tồn tại) ≠ nơi ghi `cwd/public` | Giữ lưu tại `/public/uploads/` như hiện tại. `/uploads/*` do Strapi/nginx phục vụ, không phải Nest. `main.ts:104` là lệch có sẵn, ngoài scope |

### Vị trí module (sửa sau code review)

Ban đầu `src/modules/upload/` bị xoá và code mới đặt ở `src/modules/custom-upload/`. Theo yêu cầu sau đó: **giữ lại module `upload`**, chuyển custom-upload vào trong.

- Code nằm ở `src/modules/upload/` (`custom-upload.controller.ts`, `custom-upload.service.ts`, `custom-upload-filename.util.ts`, `repository/media.repository.ts`, `__tests__/`)
- Module class trở lại tên **`UploadsModule`** (`uploads.module.ts`)
- 4 route cũ (`/v1/uploads/one|many|:id|upload-google`) **không khôi phục** — chúng phụ thuộc cột `path`/`filename` đã biến mất khỏi bảng `media`, FE không gọi, BE không import
- Route của API mới không đổi: `POST /api/v1/custom-upload`
| H3 | `.html`/`.svg` upload được, cùng origin với cookie auth → stored XSS nếu serve inline | Giữ nguyên như Strapi cũ (Strapi có `preventAccessFile` ở tầng của nó) |
| M6 | `.rar` chỉ test qua mock `node-unrar-js` | Chấp nhận rủi ro. **Chưa kiểm chứng với file .rar thật** — nếu API thư viện khác giả định thì mọi `.rar` bị từ chối mà test vẫn xanh |

### Reviewer xác nhận sạch

- Xoá `src/modules/upload/`: không còn tham chiếu nào trong `src/` lẫn `test/`
- Scan chạy trước khi publish; file bị từ chối không bao giờ chạm `public/`
- Không có TOCTOU giữa scan và move (cùng inode)
- Test zip/7z không rỗng nghĩa (`valid.*` assert `true`)
- Không có zip-slip / path traversal

## Out of scope

- 2 route `transform-file` (đã port tại `src/common/transform-file/`)
- `/admin/custom-upload`
- `folderId` / Media Library folder
- Guard cho static `public/` (Strapi có `preventAccessFile`, NestJS chưa — parity gap đã biết, `main.ts:104`)
- Refactor `POST /v1/uploads/one|many` hiện có
- Provider S3/MinIO
