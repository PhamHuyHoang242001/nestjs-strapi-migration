# Brainstorm — Port `custom-upload` Strapi → NestJS

Date: 2026-09-22
Work context: `/Users/phamhoang/Documents/project-1/nestjs-new/base-be-ts-sql`

## Problem statement

Strapi v5 (`strapiv5-old`) có API `custom-upload`. Cần port sang NestJS giữ **nguyên logic check**, code đơn giản ngang Strapi, không over-engineer.

## Scout findings

### Strapi (nguồn)

| File | LOC | Vai trò |
|---|---|---|
| `src/api/custom-upload/routes/custom-upload.ts` | 43 | 4 route |
| `.../controllers/custom-upload.ts` | 61 | user controller |
| `.../controllers/admin-custom-upload.ts` | 62 | admin controller |
| `.../services/custom-upload.ts` | 77 | user service |
| `.../services/admin-custom-upload.ts` | 70 | admin service |
| `.../middlewares/custom-upload.ts` | 451 | **toàn bộ logic check** |

4 route: `POST /custom-upload`, `POST /admin/custom-upload`, `GET /media/transform-file/:id`, `GET /admin/media/transform-file/:id`.

**Phát hiện chính:** service upload chỉ ~18 dòng, delegate hết cho `strapi.plugins.upload.services.upload.upload({ data: { fileInfo: { folder } }, files, publishedAt })`. Size limit / mime sniff / hash filename / ghi bảng `files` đều do core plugin lo. **Không có** custom size limit, mime allowlist, filename sanitization, refId/ref/field linking.

Logic check thật sự = `hasAccessFileCompression` (middleware:17-55): quét **bên trong** `.zip`/`.rar`/`.7z`, mọi entry phải khớp allowlist 29 đuôi ở `isAllowedExt` (middleware:281-318):

```
.xlsx .xlsm .csv .xlsb .pdf .jpg .jpeg .png .msg .eml .docx .pptx .html
.md .txt .json .yaml .yml .toml .py .sh .js .mjs .cjs .ts .svg .css
```

- `.zip` → `scanZip` (:321) dùng `unzipper.Open.file`; entry `Directory` được skip (:330)
- `.rar` → `scanRar` (:355) dùng `node-unrar-js`
- `.7z` → `scan7z` (:388) dùng `7z-wasm`, parse listing bằng regex (:404)
- Fail → `ValidationError(FILE_NOT_ALLOWED = E015, status INVALID_DATA)`
- File **không nén** không bị check đuôi
- `validateArchive()` (:436) còn được dùng lại ở `bi-payment-comment.ts:65,75` và `new/services/new.ts:48,58`

`config/` không có trong snapshot → **`sizeLimit` cũ không xác định được**.

### NestJS (đích)

- `src/modules/upload/uploads.controller.ts` — `POST /v1/uploads/one|many`, `BearerGuard`, disk `./public/uploads`, **không fileFilter, không limits, không validate**
- Ghi bảng `media` (`media.entity.ts`), không phải `files` của Strapi
- `transform-file` **đã port xong** → ngoài scope
- Deps có: `@aws-sdk/client-s3`, `adm-zip`, `exceljs`. Thiếu: `unzipper`, `node-unrar-js`, `7z-wasm`, `@types/multer`, `mime-types` (runtime)
- `main.ts:104` serve `public/` **không guard** — Strapi có `preventAccessFile` chặn `.pdf/.xlsx/.zip/...`. Parity gap đã biết, ngoài scope.

## Quyết định của user

| Vấn đề | Chọn |
|---|---|
| Bảng lưu metadata | `media` (user sẽ tự cập nhật schema theo chuẩn, Claude đọc lại sau) |
| Scan file nén | Đủ cả zip + rar + 7z |
| Route | Chỉ `POST /custom-upload`, **bỏ** biến thể `/admin/` |
| User/Admin | Gộp, không tách |
| Guard | `BearerGuard` |
| Size limit | Không đặt trong app — **nginx đã chặn 256MB** |
| `folderId` | Bỏ hẳn |
| Tên file | Phải có hậu tố mã không trùng lặp như Strapi |
| zip library | `adm-zip` (đã có sẵn) thay `unzipper` |

## Giải pháp chốt

### Cấu trúc

```
src/common/archive-scan/
├── allowed-extensions.const.ts      29 đuôi
├── archive-scan.util.ts             scanZip / scanRar / scan7z / validateArchive
└── __tests__/archive-scan.util.spec.ts

src/modules/custom-upload/
├── custom-upload.controller.ts      route + multer
├── custom-upload.service.ts         ghi media row + map response
└── custom-upload.module.ts
```

`archive-scan` đặt ở `common/` vì Strapi tái sử dụng `validateArchive` ở 2 module khác — đặt trong module upload sẽ gây import chéo.

### Thứ tự check (bám Strapi)

1. `BearerGuard` → 401
2. Có file không → 400 `INVALID_DATA`
3. Scan `.zip`/`.rar`/`.7z`, mọi entry trong allowlist → 400 `FILE_NOT_ALLOWED` (E015)
4. Ghi file + tạo media row → 500 nếu lỗi

File không nén không bị check đuôi (giữ nguyên hành vi Strapi).

### Khác biệt kỹ thuật bắt buộc

Strapi dùng formidable → file đã ở tmp khi middleware scan. NestJS + multer `diskStorage` ghi thẳng vào đích.

→ **multer ghi vào tmp dir → scan → hợp lệ thì move sang `public/uploads`, không hợp lệ thì xoá.** Tránh file độc hại nằm lại trong thư mục public.

### Tên file

`{tên-slug}_{10 hex ngẫu nhiên}{.ext}` — ví dụ `bao_cao_quy_3_a1b2c3d4e5.xlsx`, theo `crypto.randomBytes(5).toString('hex')` của Strapi.

### Dependency thêm

`node-unrar-js`, `7z-wasm`, `@types/multer`, `mime-types`. Dùng `adm-zip` sẵn có cho `.zip`.

## Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Thuật toán tên file suy từ trí nhớ Strapi, chưa đối chiếu được (không có `node_modules`) | Chạy `SELECT name, hash, ext, url FROM files ORDER BY id DESC LIMIT 5` trên DB Strapi thật để khớp |
| Schema `media` đang được user sửa | Plan chừa mapping response làm bước cuối, đọc entity mới trước khi code |
| `7z-wasm` nặng, khởi tạo chậm | Lazy-init, chỉ nạp khi gặp `.7z` |
| Không có size limit tầng app | Đã chặn 256MB ở nginx; nếu bypass nginx thì hở — ghi nhận |
| File tmp rác khi scan lỗi giữa chừng | `finally` xoá tmp trong mọi nhánh |

## Success criteria

- `POST /custom-upload` nhận multipart field `files` (1 hoặc nhiều), trả metadata file đã lưu
- Upload `.zip` chứa `.exe` → 400 `FILE_NOT_ALLOWED`, file **không** còn trong `public/uploads`
- Tương tự cho `.rar`, `.7z`
- `.zip` chứa toàn đuôi hợp lệ (kể cả thư mục lồng nhau) → 200
- File không nén (`.pdf`, `.xlsx`) → 200 không qua scan
- Không token → 401
- Tên file trên disk có hậu tố ngẫu nhiên, 2 lần upload cùng tên không ghi đè nhau
- Unit test cho `archive-scan.util.ts` cả 3 định dạng

## Out of scope

- 2 route `transform-file` (đã port)
- Biến thể `/admin/custom-upload`
- `folderId` / Media Library folder
- Guard cho static `public/` (`preventAccessFile`)
- Refactor `POST /v1/uploads/one|many` hiện có
- Provider S3/MinIO — chỉ local disk

## Unresolved

1. Thuật toán hash tên file của Strapi chưa đối chiếu được với bản thật.
2. Schema `media` mới chưa có → mapping response chưa khoá.
3. Multer nhận tối đa bao nhiêu file/request? Strapi không giới hạn; `/v1/uploads/many` hiện cap 10. Chưa hỏi.
4. `.zip` lồng `.zip` — Strapi chỉ quét 1 tầng, entry `.zip` bên trong sẽ bị từ chối vì `.zip` không nằm trong allowlist. Giữ nguyên hành vi này?
