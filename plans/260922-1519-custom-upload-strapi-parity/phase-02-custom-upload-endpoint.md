---
phase: 2
title: Custom upload endpoint
status: completed
priority: P1
effort: 4h
dependencies:
  - 1
---

# Phase 2: Custom upload endpoint

## Overview

Dựng `POST /custom-upload`: multer ghi tmp → scan (phase 1) → hợp lệ thì move sang `public/uploads` với tên có hậu tố ngẫu nhiên, không hợp lệ thì xoá.

## Requirements

**Functional**
- `POST /custom-upload`, `BearerGuard`, multipart field tên **`files`** (1 hoặc nhiều)
- Không có file → 400 `INVALID_DATA`
- Scan fail → 400 `FILE_NOT_ALLOWED`, file **không** còn trong `public/uploads`
- Tên file: `{slug}_{10 hex}{.ext}`
- Không cap số file, không cap dung lượng (nginx lo)

**Non-functional**
- File tmp luôn được dọn, kể cả khi lỗi giữa chừng
- Mỗi file < 200 dòng

## Architecture

### Vì sao cần tmp dir (khác Strapi về kỹ thuật, giống về hành vi)

Strapi dùng formidable → file đã nằm ở tmp khi middleware `hasAccessFileCompression` chạy; chỉ khi pass mới gọi upload plugin ghi vào `public/uploads`.

NestJS + multer `diskStorage` ghi **thẳng** vào đích. Nếu scan sau đó thì file độc hại đã nằm trong thư mục public (đang được `main.ts:104` serve tĩnh **không guard**) trong khoảng thời gian giữa ghi và xoá.

→ multer ghi vào `os.tmpdir()/custom-upload/` → scan → move sang `public/uploads`.

Không dùng `memoryStorage`: file tới 256MB, `scanRar`/`scan7z` đều cần đường dẫn file thật.

### Luồng

```
BearerGuard
  → FilesInterceptor('files'): multer ghi vào tmp
  → controller: files rỗng? → 400 INVALID_DATA
  → isArchiveContentAllowed(files) → false → xoá tmp → 400 FILE_NOT_ALLOWED
  → service: move tmp → public/uploads, tạo media row
  → finally: dọn mọi file tmp còn sót
```

<!-- Updated: Validation Session 1 - user xác nhận giữ nguyên hành vi không check file thường -->
File **không nén** đi thẳng qua bước scan mà không bị check đuôi. Hệ quả có ý thức: upload trực tiếp `.exe`/`.sh`/`.bat` sẽ **thành công**. Đây đúng là hành vi bản Strapi cũ (`hasAccessFileCompression` khởi tạo `isAccess = true`) và user đã xác nhận giữ nguyên ở Validation Session 1 — **không phải thiếu sót, đừng "sửa" khi implement**.

### Tên file — thuật toán Strapi

```ts
const ext = path.extname(originalname);                       // .xlsx
const base = slugify(path.basename(originalname, ext));       // bao_cao_quy_3
const hash = crypto.randomBytes(5).toString('hex');           // a1b2c3d4e5
const filename = `${base}_${hash}${ext}`;
```

`slugify` = lowercase, bỏ dấu tiếng Việt, ký tự ngoài `[a-z0-9]` → `_`. Hậu tố ngẫu nhiên đảm bảo 2 lần upload cùng tên không ghi đè nhau.

**Chưa đối chiếu được** với Strapi thật (`strapiv5-old` không có `node_modules`). Nếu cần khớp 100%, chạy trên DB Strapi:
```sql
SELECT name, hash, ext, url FROM files ORDER BY id DESC LIMIT 5;
```
Sai lệch chỉ ảnh hưởng thẩm mỹ tên file, không ảnh hưởng chức năng.

### Lỗi

Theo pattern sẵn có (`skill-file-fetch.util.ts:74` dùng `UnprocessableEntityException` với prefix mã lỗi):

| Trường hợp | Exception | Message |
|---|---|---|
| Không file | `BadRequestException` | `INVALID_DATA: no file uploaded` |
| Scan fail | `BadRequestException` | `FILE_NOT_ALLOWED: archive contains disallowed file type` |

Strapi trả `ValidationError(E015, status INVALID_DATA)` → cùng nhóm 400. Giữ chuỗi `FILE_NOT_ALLOWED` để FE nhận diện được.

### Route — ĐÃ XÁC MINH

<!-- Updated: Validation Session 1 - sửa route, bản nháp trước ghi sai "không prefix v1/" -->

| Mắt xích | Giá trị | Nguồn |
|---|---|---|
| FE gọi | `{BASE_URL}/api/v1/custom-upload` | `EDA_FE/src/utils/env.ts:3` — `apiUrl: process.env.BASE_URL + '/api/v1'` |
| NestJS global prefix | `api` | `main.ts:43` + `env.config.ts:36` (default `'api'`) |
| → Controller phải là | **`@Controller('v1')` + `@Post('custom-upload')`** | khớp mẫu `@Controller('v1/uploads')` của `uploads.controller.ts:28` |

Đặt `@Controller()` trần sẽ ra `/api/custom-upload` → **404 với FE**. Bản nháp đầu của phase này ghi sai điểm đó, đã sửa.

## Related Code Files

**Create**
- `src/modules/upload/custom-upload.controller.ts`
- `src/modules/upload/custom-upload.service.ts`
- `src/modules/upload/uploads.module.ts`
- `src/modules/upload/custom-upload-filename.util.ts`
- `src/modules/upload/__tests__/custom-upload.service.spec.ts`

**Modify**
- `src/app.module.ts` — đăng ký `UploadsModule` (module `upload` giữ nguyên, custom-upload nằm trong đó)
- `package.json` — thêm `@types/multer`, `mime-types`

**Read for context**
- `src/modules/upload/uploads.controller.ts` (mẫu multer + BearerGuard)
- `src/modules/upload/uploads.service.ts` (mẫu ghi Media row)

## Implementation Steps

1. `npm i mime-types && npm i -D @types/multer` — `multer` hiện resolve gián tiếp qua `@nestjs/platform-express`, khai báo tường minh.
2. Viết `custom-upload-filename.util.ts`: `buildStoredFilename(originalname)`.
3. Controller: `@UseGuards(BearerGuard)` + `@UseInterceptors(FilesInterceptor('files', undefined, { storage: diskStorage({ destination: tmpDir, filename: cb(null, randomUUID()) }) }))`.
   - Field name `files` **đã xác minh** ở `EDA_FE/.../appDetail.tsx:55` (`formData.append('files', file)`) — dùng `FilesInterceptor('files')`, không dùng `AnyFilesInterceptor`.
   - `maxCount` để `undefined` = không cap (theo quyết định của user).
   - Tên trong tmp dùng UUID thuần, tên "đẹp" chỉ áp khi move sang đích.
4. Controller check `!files?.length` → `BadRequestException('INVALID_DATA: ...')`.
5. Gọi `isArchiveContentAllowed(files)` từ phase 1 → false → xoá tmp → `BadRequestException('FILE_NOT_ALLOWED: ...')`.
6. Service `moveAndCreateMedia(files, info)`:
   - `mkdir -p public/uploads`
   - `fsp.rename` tmp → đích; nếu khác filesystem (`EXDEV`) thì fallback copy + unlink
   - tạo media row (mapping chi tiết ở **phase 3**)
   - trả mảng kết quả
7. `try/finally` dọn tmp trong **mọi** nhánh, kể cả thành công (sau rename thì tmp đã hết, chỉ dọn phần sót khi lỗi giữa chừng).
8. Đăng ký module trong `app.module.ts`.
9. Spec: mock scan util + fs, phủ 3 nhánh (không file / scan fail / thành công) + khẳng định tmp được dọn.
10. `npx tsc --noEmit` + chạy spec.

## Success Criteria

- [ ] `POST /custom-upload` không token → 401
- [ ] Không có file → 400 `INVALID_DATA`
- [ ] `.zip` chứa `.exe` → 400 `FILE_NOT_ALLOWED`, `public/uploads` **không** có file mới, tmp sạch
- [ ] `.zip` hợp lệ → 200, file nằm trong `public/uploads`
- [ ] `.pdf` (không nén) → 200, không qua scan
- [ ] Upload 3 file 1 request → 3 media row
- [ ] Upload 2 lần cùng tên → 2 file khác nhau trên disk, không ghi đè
- [ ] `tsc --noEmit` sạch, spec xanh

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| tmp và `public/uploads` khác filesystem (Docker volume) → `rename` lỗi `EXDEV` | Fallback copy+unlink ngay từ đầu, không chờ lỗi ở prod |
| ~~Global prefix làm path lệch~~ | **Đã xác minh**: FE gọi `/api/v1/custom-upload`, prefix `api` → controller phải là `@Controller('v1')`. Vẫn `curl` xác nhận khi đóng phase |
| File tmp tích tụ khi process chết giữa chừng | Dùng `os.tmpdir()` để OS tự dọn; không tự viết cron |
| ~~Field name không chắc~~ | Đã xác minh FE gửi `files` — dùng `FilesInterceptor('files')` |
| Không cap số file → 1000 file/request làm nghẽn | nginx `client_max_body_size` chặn tổng dung lượng; chấp nhận theo quyết định của user |
