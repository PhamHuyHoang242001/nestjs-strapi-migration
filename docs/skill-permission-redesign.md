# Phân quyền AI Hub (4 workspace, 2 code)

Nguồn sự thật sau plan `plans/261009-1424-ai-hub-coworker/`. Bản vẽ cũ 3-code: [skill-permission-redesign.html](./skill-permission-redesign.html) — **không** shipped. Flow seed cũ: [skill-permission-flow.md](./skill-permission-flow.md).

4 workspace: skill, prompt, api-catalog, coworker. Mỗi WS **2 code**: `*_upload` + `*_approve`.

**Ngoại lệ prompt:** upload mở cho mọi user login. `prompt_upload` vẫn còn trong DB nhưng không còn được kiểm tra; ở mọi rule bên dưới, `upload` của prompt luôn = true (create, bump, sửa rejected, diff, ẩn/hiện chỉ cần Bearer + check owner trong service). `my-permissions.canUpload` luôn `true`. Picker `GET /v1/asset-hub/users` chỉ cần Bearer.

## Quyền runtime (sau helper)

| Việc | API | Ai được |
|---|---|---|
| Tạo package | `POST /items` | `*_upload` |
| Bump = version mới | `PUT /items/:id/versions` | `(creator ∨ supporter) ∧ upload`. Approver **không**. SO **không** bump package người khác |
| Sửa version rejected newest | `PUT /versions/:vid` | Cùng `canBump` = `(creator ∨ supporter) ∧ upload` |
| Sửa version pending | `PUT /versions/:vid` | **Chỉ SO** workspace đó (`rootId===0`). Supporter **không** |
| Diff | `GET versions/:vid/diff` | submitter ∨ created_by ∨ approver |
| Approve / reject | `POST approve` / `reject` | `*_approve` |
| Ẩn/hiện | `PATCH /items/:id/status` | creator ∨ supporter ∨ SO (guard: upload ∨ approve) |
| Đọc catalog active | GET items | Bearer. Inactive: own/supporter hoặc SO (approve không widen) |
| My Version list | GET versions | submitter ∨ package `created_by` only. Supporter không thấy version người khác |
| Version detail / diff | GET versions/:vid | submitter ∨ created_by ∨ approver. Supporter không widen |

Supporter quản lý **độc lập**, không còn nhận `supporter_ids` trong create/bump/editVersion (gửi lên → 400). Bảng `ai_hub_supporters`. Tác giả (`responsible_user_ids`) ≠ supporter.

| API | Ai được | Ghi chú |
|---|---|---|
| `GET /v1/asset-hub/:type/supporter-candidates` | Bearer | User có `<ws>_upload` (role hoặc grant ngoại lệ ALLOW còn hạn). Prompt: mọi user. Phân trang + `search` email |
| `PUT /v1/asset-hub/:type/items/:id/supporters` | created_by ∨ supporter hiện tại | Body `{ supporter_ids }` ghi đè toàn bộ, `[]` xoá hết. Mỗi id phải là candidate. SO/approver **không** |

`:type` = `skill` \| `prompt` \| `api-catalog` \| `coworker`.

SO: child module `/asset-hub/skill|prompt|api-catalog|coworker`, `ROOT_OWNER_CONFIG` + `OWNER_ALL`, **không** `HIERARCHY_MAP` / records browser.

## Coworker

Prefix `/v1/ai-hub/coworker`. Clone prompt, **không** download / usage_guide / tags / category.

- Create: `code` user nhập, unique live (409 nếu trùng), immutable.
- Artifact: `channels: [{ channel_id, link }]` (≥1, mỗi channel 1 lần), `model_id`. **Mỗi channel 1 link**, lưu ở `coworker_version_channels.link`; `coworker_versions.link` đã bỏ.
- Validate link: `ai_hub_coworker_channels.domain` = origin cho phép, nhiều origin cách nhau `,` (vd `https://outlook.office.com,https://outlook.live.com`). Link hợp lệ khi `new URL(link).origin` khớp 1 origin (không phân biệt hoa thường, bỏ `/` cuối). `domain` NULL/rỗng → 400. Data `domain` do ops tự điền.
- Response: `channels: [{ id, name, link }]`. Comparison (version detail) + diff: `base` / `incoming` = `[{ channel_id, name, link }]` (`base` null nếu không có bản trước/active).
- Lookup GET `/channels` (`{ id, name, domains[] }`) `/models` Bearer.

Seed test: `coworker_uploader` = `coworker_upload`; `coworker_approver` = `coworker_approve` **không** upload.
