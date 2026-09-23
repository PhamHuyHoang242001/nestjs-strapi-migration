---
phase: 3
title: Media mapping and verify
status: completed
priority: P2
effort: 3h
dependencies:
  - 2
---

# Phase 3: Media mapping and verify

## Overview

Map file đã lưu sang bảng `media` (schema mới của user) + chốt shape response + smoke test thật đầu-cuối.

## BLOCKER — ĐÃ GỠ

<!-- Updated: Cook session - user đã đổi xong bảng media sang shape Strapi files -->

Bảng `media` đã được user đổi sang shape Strapi `files` (xác nhận bằng đọc `media.entity.ts`):

```
name, alternative_text, caption, width, height, formats, hash, ext, mime,
size, url, preview_url, provider, provider_metadata, folder_path,
created_by_id, updated_by_id, locale, focal_point
```

**Mọi cột đều nullable** → không có rủi ro vi phạm NOT NULL. Migration user xác nhận đã chạy trên DB.

Việc đổi schema này làm module `src/modules/upload/` cũ không compile (4 lỗi TS). Module đó FE không gọi, BE không import → **đã xoá** theo quyết định của user, kèm gỡ `UploadsModule` khỏi `app.module.ts`. `MediaRepository` được dựng lại trong module mới.

### Mapping đã chốt

| Cột `media` | Giá trị | Nguồn |
|---|---|---|
| `name` | tên gốc user chọn | `file.originalname` |
| `hash` | `{slug}_{10 hex}` | `buildStoredFileName()` |
| `ext` | `.xlsx` (lowercase) | `path.extname()` |
| `mime` | mimetype, fallback theo đuôi | `file.mimetype` → `mime.lookup(ext)` |
| `size` | **kilobytes**, 2 số lẻ | `bytesToKbytes(file.size)` |
| `url` | `/uploads/{hash}{ext}` | ghép |
| `provider` | `'local'` | hằng |
| `created_by_id` / `updated_by_id` | id user, `null` nếu không có | `req.info.user.id` |

Các cột còn lại (`formats`, `width`, `height`, `preview_url`, `provider_metadata`, `folder_path`, `locale`, `focal_point`, `alternative_text`, `caption`) để `null` — chúng phục vụ image-processing và Media Library của Strapi, không có nguồn dữ liệu trong luồng này.

**`size` tính bằng KB, không phải bytes** — đó là quy ước của Strapi (`bytesToKbytes`). Vì bảng này dựng theo chuẩn Strapi nên giữ cùng đơn vị, nếu không row mới sẽ lệch 1000 lần so với row cũ migrate từ Strapi. Cần user xác nhận nếu có chỗ nào đang đọc `size` theo bytes.

## Requirements

**Functional**
- Mỗi file upload → 1 media row
- Response trả metadata đủ để FE dựng URL và hiển thị tên file
- Upload nhiều file → mảng, thứ tự khớp thứ tự gửi lên

**Non-functional**
- Mapping tập trung 1 chỗ (1 hàm), không rải trong controller

## Architecture

### Cột suy được từ file upload

| Nguồn | Giá trị |
|---|---|
| `file.originalname` | tên gốc user chọn |
| tên đã sinh ở phase 2 | `{slug}_{hash}{.ext}` |
| `file.mimetype` | multer tự nhận từ `Content-Type` phần multipart |
| `file.size` | bytes |
| đường dẫn web | `/uploads/{filename}` |
| `req.info.user.id` | người upload |
| `req.info.client` | loại client |

`mime-types` dùng để **đối chiếu lại** mimetype theo đuôi file — `file.mimetype` do client khai báo, không đáng tin. Strapi cũng sniff lại ở tầng plugin.

### Response — RÀNG BUỘC CỨNG từ FE

Đã xác minh trong `EDA_FE`:

- `src/pages/aiHub/aiApp/groupApp/appDetail/api/index.ts:13` — POST `/custom-upload`, bóc `res.data.data ?? res.data`
- `.../views/appDetail.tsx:63` — **`setUrlFile(res[0].url)`**
- `.../views/appDetail.tsx:55` — `formData.append('files', file)` → field name **`files`**, xác nhận đúng như Strapi
- `.../views/appDetail.tsx:47` — FE tự cảnh báo ở 200MB (client-side, không phải ràng buộc server)

→ Response **bắt buộc**:
1. Là **mảng**, kể cả khi upload 1 file
2. Mỗi phần tử có field **`url`**
3. Controller trả **mảng trần**, không bọc object

Về điểm 3: `TransformInterceptor` (`src/common/interceptors/transform.interceptor.ts:17`) chỉ `map(payload => payload as Response<T>)` — **no-op passthrough**, không bọc gì cả dù interface khai báo `{ data, statusCode }`. Nên `res.data` = đúng thứ controller return. FE làm `res.data.data ?? res.data` → trả mảng → `res[0].url` chạy. Nếu bọc `{ data: [...] }` thì FE lấy `res.data.data` = mảng, cũng chạy — nhưng trả mảng trần là khớp Strapi hơn.

Đây là ràng buộc duy nhất FE đang phụ thuộc. Các field khác (`name`, `size`, `mime`…) tự do đặt theo schema `media` mới, nhưng **giữ thêm tên kiểu Strapi vẫn an toàn hơn** phòng khi có chỗ gọi khác chưa grep ra.

## Related Code Files

**Read first (BẮT BUỘC)**
- `src/modules/databases/media.entity.ts` (schema MỚI)
- `src/migration/` (migration mới nhất của `media`)

**Modify**
- `src/modules/upload/custom-upload.service.ts` — mapping thật
- `src/modules/upload/__tests__/custom-upload.service.spec.ts` — assert theo cột mới

**Create (nếu cần)**
- `src/modules/upload/custom-upload-response.helper.ts` — nếu mapping > 20 dòng

## Implementation Steps

1. Đọc `media.entity.ts` mới + migration. Liệt kê cột, cột nào `NOT NULL`, cột nào có default.
2. Chốt mapping file → cột, ghi thành bảng trong phase này (cập nhật file này, không để trong đầu).
3. Chốt shape response, đối chiếu với `TransformInterceptor`.
4. Viết mapping trong service; tách helper nếu > 20 dòng.
5. Cập nhật spec theo cột mới.
6. Smoke test thật:
   ```bash
   curl -X POST "$BASE/custom-upload" -H "Authorization: Bearer $TOKEN" -F "files=@ok.zip"
   curl -X POST "$BASE/custom-upload" -H "Authorization: Bearer $TOKEN" -F "files=@bad.zip"   # mong đợi 400
   curl -X POST "$BASE/custom-upload" -H "Authorization: Bearer $TOKEN" -F "files=@a.pdf" -F "files=@b.xlsx"
   ```
7. Kiểm DB: `SELECT * FROM media ORDER BY id DESC LIMIT 5;` — cột không null, path đúng.
8. Mở `{BASE}/uploads/{filename}` trên browser xác nhận file phục vụ được.
9. `npx tsc --noEmit` + chạy toàn bộ suite (không chỉ spec mới) để bắt regression.

## Success Criteria

- [ ] Mapping khớp schema `media` mới, không cột `NOT NULL` nào bị bỏ trống
- [ ] Upload 1 file → 1 row đúng dữ liệu
- [ ] Upload nhiều file → nhiều row, thứ tự khớp
- [ ] Response đủ field FE cần (xác nhận với FE hoặc đối chiếu shape Strapi cũ)
- [ ] File mở được qua URL trả về
- [ ] Toàn bộ test suite xanh, không regression
- [ ] `tsc --noEmit` sạch

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| Schema `media` mới thiếu cột cho dữ liệu multer sinh ra | Bước 1 đối chiếu sớm; thiếu thì báo user trước khi code, không tự thêm migration |
| FE đọc field theo tên Strapi (`name`/`url`/`ext`/`mime`) | Nếu lệch, thêm lớp map trong response helper — rẻ hơn nhiều so với sửa FE |
| `TransformInterceptor` bọc thêm 1 lớp làm FE parse sai | Kiểm bằng `curl` thật ở bước 6, không suy đoán |
| Mimetype client khai báo sai | Đối chiếu lại bằng `mime-types` theo đuôi file |

## Trạng thái kiểm chứng

| Hạng mục | Kết quả |
|---|---|
| Mapping khớp schema mới | ✅ mọi cột nullable, không vi phạm NOT NULL |
| Response là mảng trần có `url` | ✅ có test riêng khoá contract này |
| Path cuối `/api/v1/custom-upload` | ✅ xác minh qua metadata Nest, khớp `EDA_FE/src/utils/env.ts:3` |
| `tsc --noEmit` | ✅ sạch |
| eslint (file mới) | ✅ sạch |
| Toàn bộ test suite | ✅ 1439/1439 |
| **Smoke test DB + curl thật** | ❌ **CHƯA CHẠY** |

### Vì sao smoke test chưa chạy

Repo không có `.env` lẫn thư mục `config/` → `NestFactory.create()` fail ngay ở TypeORM vì thiếu thông tin kết nối DB. Không có credential thì không boot được app để gọi thật.

Đã thay bằng kiểm chứng tĩnh: reflect `PATH_METADATA` + `METHOD_METADATA` trên controller để chứng minh path ghép ra đúng `POST /api/v1/custom-upload`.

**Còn phải chạy khi có môi trường** (user tự chạy hoặc cấp env):

```bash
BASE=http://localhost:3000/api/v1
curl -i -X POST "$BASE/custom-upload" -H "Authorization: Bearer $TOKEN" -F "files=@ok.zip"      # 200
curl -i -X POST "$BASE/custom-upload" -H "Authorization: Bearer $TOKEN" -F "files=@bad.zip"     # 400 FILE_NOT_ALLOWED
curl -i -X POST "$BASE/custom-upload" -H "Authorization: Bearer $TOKEN" -F "files=@a.pdf" -F "files=@b.xlsx"  # 200, 2 phần tử
curl -i -X POST "$BASE/custom-upload"                                                           # 401
```

```sql
SELECT id, name, hash, ext, mime, size, url, provider, created_by_id FROM media ORDER BY id DESC LIMIT 5;
```

Sau đó mở `{host}/uploads/{hash}{ext}` xác nhận file phục vụ được, và kiểm `public/uploads` **không** có file nào sinh ra từ lần upload `bad.zip`.

Fixture sẵn dùng: `src/common/archive-scan/__tests__/fixtures/valid.zip`, `has-exe.zip`.

## Unresolved

1. ~~Schema `media` mới~~ — đã xong, user cập nhật trong lúc cook.
2. ~~Field name response~~ — FE chỉ đọc `res[0].url`, đã khoá bằng test.
3. **`size` lưu KB hay bytes?** Đang theo Strapi (KB). Cần xác nhận nếu có consumer đọc theo bytes.
4. **Smoke test thật chưa chạy** — thiếu credential DB.
5. **Không có fixture `.rar` thật** — máy không có công cụ tạo rar, nhánh `.rar` chỉ test bằng mock ở ranh giới `node-unrar-js`.
