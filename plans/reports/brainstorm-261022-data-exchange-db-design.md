# Brainstorm: DB module Data Exchange (Data Services + Từ điển dữ liệu + App thụ hưởng)

> **Superseded (validate 2026-10-22):** `dx_options` removed — the 12 technical lists are enums (VARCHAR + CHECK). Join tables are hard-deleted (no soft-delete columns). Audit columns (`created_by`/`updated_by`/`changed_by`) have no FK. **Session 2:** all tables renamed `dx_*` → `data_hub_*` (services → `data_hub_data_services`); every user id is plain INT with no FK; consumer SO/Tech/Biz are columns; data service BU/IT support use `data_hub_data_service_requesters` / `_it_supporters`. See `plans/261022-data-exchange-db-schema/plan.md` → Validation Log.

Date: 2026-10-22 · Status: **approved** (design) · Supersedes: `brainstorm-261019-data-exchange-db-design-paused.md`

Nguồn: mock `Mock-EDA-Portal/data-exchange/` (`data-exchange-catalog.html`, `-create.html`, `-detail.html`, `-terms.html`, `-term-create.html`, `-business-term-create.html`, `-consumers.html`, `-consumer-detail.html`, `data-exchange-store.js`, `data/*.json`) + xlsx `[EDA Portal - Data Exchange] Định nghĩa các trường thông tin.xlsx` (sheet API, ETL, Data Terms, Consumers). DB đặt trong base-be-ts-sql (Postgres, quy ước AI Hub).

## Locked decisions

| # | Chủ đề | Quyết định |
|---|---|---|
| 1 | Sửa Data Service | Sửa trực tiếp, **không duyệt**. Mỗi lần tạo/sửa ghi 1 dòng history |
| 2 | API vs SFTP | `dx_services` (chỉ trường chắc chắn chung) + `dx_service_api_specs` / `dx_service_sftp_specs` 1-1 (PK = service_id). Trường có thể trống → NULL |
| 3 | History DV | 1 dòng / lần sửa: version_no, action, change_note, changed_by, `changes` JSONB `[{section, field, label_vi, label_en, old, new}]` chỉ trường đổi (list app/term/người dạng mảng) |
| 4 | Từ điển | Logical + physical **không duyệt**. Logical 1-N physical; physical `logical_term_id` NULL được |
| 5 | History logical | `dx_logical_term_histories.snapshot` JSONB = bản ghi + danh sách physical gắn tại thời điểm đó |
| 6 | App thụ hưởng | Không duyệt, **có history** (snapshot); trường theo mock |
| 7 | Quan hệ N-N | service↔physical, service↔consumer (app 1–3/dịch vụ, validate ở app) |
| 8 | Người | FK users qua bảng nối có role: `dx_service_users` (REQUESTER, IT_SUPPORT), `dx_consumer_users` (SO, TECH, BIZ). Người tạo = `created_by` |
| 9 | Tổ chức | `dx_divisions` (khối) + `dx_departments` (đơn vị phát hành/quản lý, thuộc khối) dùng chung DV + App. Không dùng `ai_hub_publishers` |
| 10 | Danh mục | `dx_request_units` (BU, bỏ nhập tự do); danh mục kỹ thuật gom 1 bảng `dx_options(group_code, code, label, sort_order, is_active)` |
| 11 | Hệ thống in/out của term | **Suy ra**: in = DV gắn physical; out = app của các DV đó. Không lưu |
| 12 | Số API/SFTP/term của app | Suy ra qua bảng nối, không lưu |
| 13 | Lĩnh vực nghiệp vụ | Chưa tạo bảng (không trường nào dùng). Mã DV: `{API\|SFT}-{mã khối}-{seq}` |
| 14 | Bản nháp | Bỏ. `status` = active / inactive |
| 15 | Index | **Chưa đánh index lọc**. Chỉ unique cần cho đúng dữ liệu |
| 16 | Quy ước | Tiền tố `dx_`, snake_case số nhiều, mỗi bảng có id, created_at, updated_at, deleted_at, is_deleted; unique = partial `WHERE deleted_at IS NULL` |

## Bảng

**Danh mục / tổ chức**
- `dx_divisions`: code UK, name
- `dx_departments`: code UK, name, division_id FK
- `dx_request_units`: code UK, name, category
- `dx_options`: group_code, code (UK theo group), label, sort_order, is_active. Groups: `API_METHOD`, `API_BASE_URL`, `API_AUTH_TYPE`, `API_TOKEN_AUTH_METHOD`, `API_UPDATE_FREQUENCY`, `API_SYNC_MODE`, `SFTP_AUTH_TYPE`, `SFTP_KEY_VAULT_METHOD`, `SFTP_FILE_FORMAT`, `SFTP_EXPORT_FREQUENCY`, `SFTP_ENCRYPTION`, `SFTP_FLOW_DIRECTION`

**Data Services**
- `dx_services`: service_code UK, service_type (API|SFTP), name (≤90), short_description (≤400), purpose (≤1000, NULL), request_unit_id, division_id, department_id, source_table, usage_guide_html, status, version_no, created_by, updated_by
- `dx_service_api_specs`: service_id PK/FK, method_id, base_url_id, endpoint_path, auth_type_id, token_endpoint NULL, token_auth_method_id NULL, peak_tps NULL, update_frequency_id, sync_mode_id, timeout NULL
- `dx_service_sftp_specs`: service_id PK/FK, host, port (default 22), auth_type_id, key_vault_method_id NULL, vault_account NULL, folder_path, file_name_pattern, file_format_id, export_frequency_id, max_file_size NULL, encryption_id, flow_direction_id
- `dx_service_histories`: service_id, version_no, action, change_note, changes JSONB, changed_by
- `dx_service_users`: service_id, user_id, role — UK (service_id, user_id, role)
- `dx_service_consumers`: service_id, consumer_id — UK pair
- `dx_service_physical_terms`: service_id, physical_term_id — UK pair

**Từ điển**
- `dx_logical_terms`: code UK, name, short_description (≤400), example_value NULL, created_by, updated_by
- `dx_physical_terms`: physical_column UK, technical_description, example_value, logical_term_id NULL, created_by, updated_by
- `dx_logical_term_histories`: logical_term_id, version_no, action, snapshot JSONB, changed_by

**App thụ hưởng**
- `dx_consumers`: code UK (UPPER), name, category (INTERNAL_APP|PARTNER_ECOSYSTEM), division_id, department_id, short_description (≤200), status, created_by, updated_by
- `dx_consumer_users`: consumer_id, user_id, role — UK triple
- `dx_consumer_histories`: consumer_id, version_no, action, snapshot JSONB, changed_by

## Đáp ứng tính năng mock

| Tính năng | Cách đáp ứng |
|---|---|
| Catalog lọc API/SFTP, method, chiều PUSH/PULL, khối, đơn vị, app, term, tần suất | cột service_type + join spec / bảng nối |
| Tìm kiếm tên, mã, mô tả, endpoint, term | ILIKE trên dx_services + spec + join |
| Tab lịch sử phiên bản + modal diff | 1 dòng dx_service_histories |
| Tab từ điển của DV | join dx_service_physical_terms → physical → logical |
| Trang từ điển: cây logical → physical, lọc hệ thống đầu ra, KPI | join suy ra in/out; count |
| Trang app: tab nội bộ/đối tác, lọc khối/term/loại kết nối, số API/SFTP | category + join suy ra |

## Rủi ro / lưu ý
- Danh mục mock không nhất quán (khối 7/2/8 giá trị, đơn vị 9/20/24) → cần chốt dữ liệu seed thật.
- `dx_options` dùng FK chung → app phải kiểm tra option đúng `group_code` khi lưu.
- History DV: service tự build diff trước khi update (so bản cũ/mới, kể cả bảng nối) trong 1 transaction.
- Suy ra in/out, số API/SFTP: khi dữ liệu lớn có thể cần index (đã hoãn theo yêu cầu).

## Câu hỏi mở
- Dữ liệu seed chuẩn cho khối, đơn vị, BU, các nhóm option.
- Có cần phân quyền theo SO/owner (như AI Hub) — user nói sẽ cấu hình quyền sau.
