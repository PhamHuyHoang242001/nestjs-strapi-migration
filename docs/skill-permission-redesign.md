# Phân quyền AI Hub (4 workspace, 2 code)

Nguồn sự thật sau plan `plans/261009-1424-ai-hub-coworker/`. Bản vẽ cũ 3-code: [skill-permission-redesign.html](./skill-permission-redesign.html) — **không** shipped. Flow seed cũ: [skill-permission-flow.md](./skill-permission-flow.md).

4 workspace: skill, prompt, api-catalog, coworker. Mỗi WS **2 code**: `*_upload` + `*_approve`.

## Quyền runtime (sau helper)

| Việc | API | Ai được |
|---|---|---|
| Tạo package | `POST /items` | `*_upload` |
| Bump = version mới | `PUT /items/:id/versions` | `(creator ∨ supporter) ∧ upload`. Approver **không**. SO **không** bump package người khác |
| Sửa version rejected newest | `PUT /versions/:vid` | Cùng `canBump` |
| Sửa version pending | `PUT /versions/:vid` | **Chỉ SO** workspace đó (`rootId===0`) |
| Approve / reject | `POST approve` / `reject` | `*_approve` |
| Ẩn/hiện | `PATCH /items/:id/status` | creator ∨ supporter ∨ SO (guard: upload ∨ approve) |
| Đọc catalog active | GET items | Bearer. Inactive: own/supporter, hoặc approve/SO |

`supporter_ids` full-replace trên create/bump/editVersion (không PATCH riêng). Bảng `ai_hub_supporters`. Tác giả (`responsible_user_ids`) ≠ supporter.

SO: child module `/asset-hub/skill|prompt|api-catalog|coworker`, `ROOT_OWNER_CONFIG` + `OWNER_ALL`, **không** `HIERARCHY_MAP` / records browser.

## Coworker

Prefix `/v1/ai-hub/coworker`. Clone prompt, **không** download / usage_guide / tags / category.

- Create: `code` user nhập, unique live (409 nếu trùng), immutable.
- Artifact: `channel_ids[]`, `model_id`, `link` origin `https://teams.microsoft.com`.
- Lookup GET `/channels` `/models` Bearer, seed migration.

Seed test: `coworker_uploader` = `coworker_upload`; `coworker_approver` = `coworker_approve` **không** upload.
