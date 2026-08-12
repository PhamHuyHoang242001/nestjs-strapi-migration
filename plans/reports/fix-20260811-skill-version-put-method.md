# Report — Đổi API tạo version skill sang PUT (full-body)

**Ngày:** 2026-08-11
**Loại:** fix / refactor (API method)
**Trạng thái:** DONE — đã sửa + verify, CHƯA commit
**Repo:** `base-be-ts-sql` (nestjs) — branch `main`

---

## Yêu cầu

- Đổi `@Post('items/:id/versions')` → **PUT**.
- Chuẩn PUT: client gửi **full body** (không partial update).
- **Không** gộp active/inactive vào endpoint này (giữ `PATCH items/:id/status` riêng).

## Quyết định chốt (từ user)

| Điểm | Chốt |
|------|------|
| HTTP method | `POST` → `PUT` |
| Body | Full body — DTO giữ nguyên, các field `file`/`name`/`short_description`/`category` vẫn required |
| Partial/carry-over | KHÔNG làm |
| Gộp status active/inactive | KHÔNG — giữ `PATCH items/:id/status` riêng (cần `skill_approve`) |

## Thay đổi code

**File:** `src/modules/skill-package/skill-package.controller.ts`
- Import thêm `Put` từ `@nestjs/common`.
- `@Post('items/:id/versions')` → `@Put('items/:id/versions')` (method `createVersion`).
- Cập nhật comment mô tả verb + invariant.

Không sửa: DTO, `skill-package-upload.service.ts` (`createVersion` logic), `toggleStatus`, query service, tests.

## Invariant đã đảm bảo (không cần sửa thêm)

- `createVersion` INSERT `SkillVersion` state=`PENDING`, `version_no = max+1`, **KHÔNG** đụng `pkg.active_version_id` / `pkg.status`.
- `list()` / `detail()` serve qua `active_version_id` → bản đã approve vẫn phục vụ end-user.
- Chỉ `approve()` mới swap `active_version_id` sang bản mới.
- → Bản approved cũ chạy liên tục tới khi bản mới được approve thay thế. ✔

## Ràng buộc còn giữ

- Index `uidx_skill_versions_one_pending_per_package` (partial-unique, state=pending): mỗi package chỉ 1 bản pending. PUT khi đã có pending → PG `23505` → **409**.
- Quyền: `skill_upload`; approver sửa mọi package, uploader chỉ package của mình.

## Verify

- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- `npx jest src/modules/skill-package` → **91/91 pass** (4 suites). Không hồi quy (test gọi trực tiếp method controller, độc lập verb).

## Ảnh hưởng client (BREAKING)

- Endpoint: `PUT /api/v1/skill/items/:id/versions` (path giữ nguyên, **đổi verb POST → PUT**).
- Body giữ nguyên schema (`CreateSkillVersionDto`): `file{fileUrl,name?,type?}`, `name`, `short_description`, `category`, `avatar_url?`, `tags?`, `changelog_note?`.
- Response giữ nguyên: `{ version: { id, version_no } }`.
- Mọi caller FE/tài liệu/collection đang gọi `POST .../versions` phải đổi sang `PUT`.

## Việc còn lại (tuỳ chọn)

- [x] Cập nhật client FE: đổi method POST → PUT ở chỗ submit version — `EDA_FE/.../skill/api/skillApi.ts` (`uploadUpdate`).
- [x] Cập nhật e2e caller (`skill-package-flow.e2e-spec.ts`): helper `uploadReq` thêm tham số `method`, 2 call site version-bump dùng `'put'`.
- [x] Swagger/postman/tài liệu tĩnh: KHÔNG có file nào trong repo (đã grep toàn repo).
- [ ] Commit (user yêu cầu CHƯA commit).

## Client sync — verb POST → PUT (2026-08-11, tiếp)

**Callers của `/skill/items/:id/versions` đã đổi sang PUT (2 file, chỉ endpoint này):**
- `EDA_FE/src/modules/asset-hub/pages/skill/api/skillApi.ts` — `uploadUpdate`: `axios.post` → `axios.put`. (KHÔNG đụng `uploadNew` = `POST /items`.)
- `nestjs-new/base-be-ts-sql/test/skill-package-flow.e2e-spec.ts` — `uploadReq` thêm `method: 'post'|'put'='post'`; 2 call `/items/:id/versions` truyền `'put'`; header doc POST→PUT.

**Status code 201 → 200 (side-effect, đã chốt với user = "chấp nhận 200"):**
PUT không có `@HttpCode(201)` → NestJS trả **200** (POST mặc định 201). E2E success-submit đổi `.expect(201)` → `.expect(200)`. FE axios không assert status nên không ảnh hưởng. Call `409` (dup-pending) giữ nguyên (exception tự set status).

**KHÔNG đụng:** `PATCH items/:id/status`, approve/reject (POST), DTO/body, `uploadService.createVersion`.

**Verify:** BE `tsc --noEmit` exit 0; `jest src/modules/skill-package` 91/91 pass. FE `skillApi.ts` sạch (123 lỗi tsc còn lại là alias-resolution có sẵn, repo build bằng webpack). E2E cần DB để chạy — assertion 200 khớp default NestJS cho PUT.

## Unresolved questions

- E2E `skill-package-flow.e2e-spec.ts` chưa chạy thực tế trong session (cần DB + bootstrap app); assertion `.expect(200)` dựa trên default NestJS PUT (không có `@HttpCode`). Nên chạy e2e với DB để xác nhận cuối.
