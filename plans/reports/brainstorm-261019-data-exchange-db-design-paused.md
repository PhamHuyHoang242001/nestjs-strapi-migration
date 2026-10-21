# Brainstorm (TẠM DỪNG): Thiết kế DB module Trao đổi dữ liệu

Date: 2026-10-19 · Status: **paused** — user đổi hướng thiết kế sau buổi họp, sẽ cập nhật HTML mock rồi brainstorm lại. Các quyết định dưới đây có thể bị thay đổi; xác nhận lại trước khi dùng.

Phạm vi: Trao đổi dữ liệu (dịch vụ API/ETL) + Từ điển dữ liệu (logical/physical term) + Đơn vị thụ hưởng — repo mock `/Users/phamhoang/Documents/project-1/Mock-EDA-Portal`, DB đặt trong base-be-ts-sql.

## Nguồn đã scout

- api-catalog: `api_catalog_packages` (code, status active/inactive, active_version_id, publisher_id, owning_unit_name) + `api_catalog_versions` (state, version_no, old_version, kỹ thuật, submitted/reviewed/reject_reason); join responsibles, supporters, coworkers, tags; soft-delete 2 cột.
- xlsx sheet API: 38 trường (khớp package+version; thêm base_url, avg_response_time, latency_p99, retry_policy, request_unit_name, request_user_ids, physical_term #10, exploit_unit_name #11, logical/description/source #27–29). ETL = copy API; Data Terms / Consumers trống.
- Mock: 148 dịch vụ (112 API, 36 SFTP/ETL: connector, flowDirection, fileFormat, frequency, sftp_file_pattern, target_table); parameters_detail[], headers[], mapped_terms[]; terms 2 cấp; subscribers 42; tab Chờ cấp quyền, Playground, Audit, Lịch sử phiên bản.

## Đã chốt (trước buổi họp)

| # | Chủ đề | Quyết định |
|---|---|---|
| 1 | Nơi đặt | base-be-ts-sql, quy ước AI Hub (snake_case số nhiều, soft-delete, package+version, dùng chung users/publishers/phân quyền) |
| 2 | API vs ETL | 1 cặp bảng package/version + `service_type` API\|ETL; phần kỹ thuật tách bảng chi tiết 1-1 (api_spec / etl_spec) |
| 3 | Version dịch vụ | Giống hệt api-catalog (#30–38), 1 pending / package |
| 4 | Từ điển | Không version; duyệt trên bản ghi. **Đơn vị duyệt = logical term** (kèm các physical) |
| 5 | Quan hệ | Dịch vụ, physical term, đơn vị thụ hưởng quan hệ N-N; logical 1-N physical |
| 6 | DV ↔ ĐVTH | Gắn vào version dịch vụ |
| 7 | DV ↔ term | Gắn tới **physical** (bảng nối thuần, không mô tả/bảng nguồn theo trường); logical chỉ để gom nhóm/hiển thị |
| 8 | ĐVTH ↔ term | Suy ra qua dịch vụ, không lưu bảng nối |
| 9 | Hệ thống đầu vào của term | = các dịch vụ khai báo term đó (suy ra), không phải danh mục riêng |
| 10 | ĐVTH | Không version; khai báo, sửa, duyệt trực tiếp trên bản ghi |
| 11 | Sửa bản đã duyệt (logical term / ĐVTH) | Quay về pending, vẫn dùng được, hiển thị nhãn "Chờ duyệt lại" |
| 12 | Physical term | Không cần duyệt |

## Còn mở (chưa trả lời)

1. Physical term có được tồn tại khi chưa thuộc logical nào (logical_term_id nullable)?
2. Dịch vụ chỉ chọn ĐVTH đã duyệt hay cả pending?
3. Tính năng thêm: audit trail (đề xuất dùng `change_historys` có sẵn), yêu cầu cấp quyền kết nối, params/headers Playground, danh mục lĩnh vực nghiệp vụ?
4. Giữ trường AI Hub không có trong xlsx: category, supporters, avatar/kind, sla/tps/rate_limit/encryption?
5. Trường riêng cho ETL (sheet ETL đang copy API).

## Bước tiếp

User cập nhật HTML mock theo hướng mới → chạy lại `/ck:brainstorm`, đọc lại mock + file này, xác nhận lại các quyết định trên trước khi vẽ ERD.
