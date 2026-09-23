---
phase: 1
title: Archive scan util
status: completed
priority: P1
effort: 4h
dependencies: []
---

# Phase 1: Archive scan util

## Overview

Port `middlewares/custom-upload.ts:281-451` sang util dùng chung: allowlist 29 đuôi + `scanZip`/`scanRar`/`scan7z` + 2 hàm public. Không đụng HTTP layer.

## Requirements

**Functional**
- Quét entry bên trong `.zip`/`.rar`/`.7z`, mọi entry phải khớp allowlist
- Entry thư mục bỏ qua (không có đuôi → không bị từ chối oan)
- Mọi exception → trả `false` (fail-closed, giống Strapi)

**Non-functional**
- Không phụ thuộc NestJS DI — util thuần, test được độc lập
- `7z-wasm` lazy-init, chỉ nạp khi gặp `.7z`
- File < 200 dòng

## Architecture

Đặt ở `src/common/archive-scan/` chứ không trong module upload: bên Strapi `validateArchive` được gọi lại ở `bi-payment-comment.ts:26,72` và `new/services/new.ts:23,55` (đã xác minh bằng grep). Để trong module upload sẽ gây import chéo khi port tiếp 2 chỗ đó.

### Hai hàm public — ngữ nghĩa NGƯỢC nhau, giữ nguyên cả hai

| Hàm | File không nén | Nguồn |
|---|---|---|
| `isArchiveContentAllowed(files)` | **`true`** (cho qua) | `hasAccessFileCompression`, `isAccess = true` khởi tạo (`:19`) |
| `validateArchive(file)` | **`false`** (từ chối) | `validateArchive`, `isAccess = false` khởi tạo (`:437`) |

Đây không phải nhầm lẫn của Strapi mà là 2 use-case khác nhau: middleware upload cho phép mọi file thường, còn `validateArchive` dùng ở chỗ **bắt buộc** phải là archive. Phase 2 chỉ dùng hàm đầu.

### Allowlist (29 đuôi, `isAllowedExt` :282-311)

```
.xlsx .xlsm .csv .xlsb .pdf .jpg .jpeg .png .msg .eml .docx .pptx .html
.md .txt .json .yaml .yml .toml .py .sh .js .mjs .cjs .ts .svg .css
```

Chép nguyên, không thêm bớt. `.zip` **không** có trong danh sách → archive lồng archive bị từ chối (hành vi Strapi, đã xác nhận với user).

### Ba scanner

| Đuôi | Strapi dùng | NestJS dùng | Ghi chú |
|---|---|---|---|
| `.zip` | `unzipper.Open.file` | **`adm-zip`** (đã có sẵn) | `entry.isDirectory` thay `entry.type === "Directory"` |
| `.rar` | `node-unrar-js` | y nguyên | `createExtractorFromData` + `getFileList().fileHeaders[].name` |
| `.7z` | `7z-wasm` | y nguyên | ghi vào FS ảo, `callMain(['l', ...])`, parse stdout bằng regex |

Regex 7z giữ nguyên (`:404`):
```
/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+[\.\w]+\s+\d*\s+\d*\s+(.+)$/
```
Dòng không khớp → bỏ qua. Tên không chứa `.` → bỏ qua (coi là thư mục) — logic `:409`.

## Related Code Files

**Create**
- `src/common/archive-scan/allowed-extensions.const.ts`
- `src/common/archive-scan/archive-scan.util.ts`
- `src/common/archive-scan/index.ts`
- `src/common/archive-scan/__tests__/archive-scan.util.spec.ts`
- `src/common/archive-scan/__tests__/fixtures/` (zip/rar/7z mẫu: 1 hợp lệ + 1 chứa `.exe` mỗi loại)

**Modify**
- `package.json` — thêm `node-unrar-js`, `7z-wasm`

## Implementation Steps

1. `npm i node-unrar-js 7z-wasm` — kiểm tra `7z-wasm` build được trên môi trường dev (wasm, có thể cần Node flag).
2. Viết `allowed-extensions.const.ts`: mảng 29 đuôi + `isAllowedExt(fileName): boolean` dùng `path.extname().toLowerCase()`.
3. Viết `scanZip(filePath)` với `adm-zip`: `new AdmZip(path).getEntries()`, skip `entry.isDirectory`, check `entry.entryName`.
4. Viết `scanRar(filePath)`: đọc buffer → `createExtractorFromData` → duyệt `fileHeaders`.
5. Viết `scan7z(filePath)`: lazy `await import('7z-wasm')`, gom stdout qua `print`/`printErr`, parse regex.
6. Bọc mỗi scanner trong `try/catch` → `return false`. **Không** log-and-rethrow: Strapi nuốt lỗi và trả false.
7. Viết `isArchiveContentAllowed(files: {path, originalname}[])` — duyệt mảng, gặp `false` đầu tiên thì dừng.
8. Viết `validateArchive(file)` — khởi tạo `false`, chỉ true khi là archive hợp lệ.
9. Tạo fixture: 6 file nén nhỏ (zip/rar/7z × hợp lệ/không hợp lệ). Sinh bằng script, commit vào repo.
10. Viết spec phủ: hợp lệ, chứa `.exe`, thư mục lồng nhau, file rỗng, file hỏng.
11. `npx tsc --noEmit` + `npx jest src/common/archive-scan`.

## Success Criteria

- [ ] `.zip` toàn đuôi hợp lệ (kể cả thư mục lồng) → `true`
- [ ] `.zip` chứa `.exe` → `false`
- [ ] Tương tự cho `.rar` và `.7z`
- [ ] File nén hỏng / không đọc được → `false`, không ném exception ra ngoài
- [ ] `isArchiveContentAllowed` với file `.pdf` → `true`
- [ ] `validateArchive` với file `.pdf` → `false`
- [ ] `tsc --noEmit` sạch, spec xanh
- [ ] Mỗi file < 200 dòng

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| `7z-wasm` không chạy trong Jest (wasm + FS ảo) | Test trước ở bước 1. **Vỡ thì DỪNG và hỏi user** — không tự đổi thư viện hay bỏ `.7z` (quyết định Validation Session 1) |
| `adm-zip` khác `unzipper` ở tên entry (tách thư mục) | Test fixture có thư mục lồng nhau để đối chiếu |
| `adm-zip` đọc cả file vào RAM | File tối đa 256MB qua nginx — chấp nhận được, nhưng ghi nhận nếu sau này bỏ chặn |
| Fixture nén commit vào repo bị coi là binary rác | Giữ nhỏ (< 5KB mỗi file), đặt trong `__tests__/fixtures/` |
