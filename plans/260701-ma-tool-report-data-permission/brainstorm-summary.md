# Brainstorm — Phân quyền data cho ma_tool_cstb_rpt_properties (không cha)

Date: 2026-07-01
Status: Approved — superseded on some points by red-team (see plan.md)
Work context: nestjs-new/base-be-ts-sql

> **CORRECTION (red-team 2026-07-01):** claims "super_admin: tất cả" / "super_admin thấy tất cả" below are FALSE — the interceptor never nulls scope, so super_admin is scoped like everyone and needs grants (decision: match diagnostic). See `plan.md` → Key decisions + Red Team Review. This file is kept as historical design record; `plan.md` + phase files are authoritative.

## Problem statement
Migrate `ma_tool_cstb_rpt_properties` sang NestJS + phân quyền data. Bảng KHÔNG có cha (khác diagnostic có bicc_department làm root cho SO). Cần định hướng cách phân quyền data ở tầng data_access khi không có phân cấp.

## Decisions (user confirmed)
1. **Cơ chế SO**: chỉ **explicit data_access** — KHÔNG dùng `resource_owners`. "SO" = người admin đi gán, không có kế thừa ngầm.
2. **Đơn vị scope**: theo **từng record** report (thật sự không cha). Bỏ qua FK `data_service_center_id` cho lần này.
3. **Vị trí role tree**: tạo **root module "MA Tool" mới** → con "Report".
4. **Verb**: chỉ **view (read)**.
5. Cột hiển thị tên trong UI data_access: `rpt_code`.
6. Response GET: trả full entity (trọng tâm là phân quyền).
7. `findOne`: theo pattern 404 (không tồn tại) vs 403 (ngoài scope).
8. **Scope lần này**: chỉ triển khai phân quyền — KHÔNG migrate data từ Strapi.

## Chosen solution: standalone table, explicit-only data_access
Khai báo bảng là root không cha trong `HIERARCHY_MAP` nhưng KHÔNG đăng ký `ROOT_OWNER_CONFIG` → nhánh `ownedRoots` luôn rỗng → `DataScope` rút gọn còn `explicit` (`rec.id = ANY(:explicit)`). Tái dùng toàn bộ machinery data_access hiện có.

### A. Role tree (seeders)
- `module.seeder.ts`: root module "MA Tool" (`table_name=null`, `parent_id=null`) + con "Report" (`table_name='ma_tool_cstb_rpt_properties'`).
- `permission.seeder.ts`: 1 permission `ma_tool_report_view` (action `read`, method `GET`, module_id = Report).
- Impl note: chọn module id + permission id chưa bị chiếm (hiện module ~ đến 18, permission ~ đến 34+; verify max trước khi gán).

### B. Data-access wiring
- `data-access-table.enum.ts`: `MA_TOOL_CSTB_RPT_PROPERTIES = 'ma_tool_cstb_rpt_properties'`.
- `hierarchy-config.ts` `HIERARCHY_MAP`: `ma_tool_cstb_rpt_properties: null`.
- `hierarchy-config.ts` `NAME_COLUMN_MAP`: `ma_tool_cstb_rpt_properties: 'rpt_code'`.
- KHÔNG thêm `ROOT_OWNER_CONFIG` (giữ explicit-only).

### C. NestJS read module
- Controller `ma-tool/report`: `GET /` (list, phân trang theo convention hiện có) + `GET /:id`.
- Guards: `BearerGuard → PermissionGuard → DataAccessInterceptor`.
- Decorators: `@RequirePermission('ma_tool_report_view')` + `@RequireDataAccess(MA_TOOL_CSTB_RPT_PROPERTIES, 'ma_tool_report_view')`.
- Service `findAll/findOne`: tái dùng `applyDataScope(qb, alias, 'ma_tool_cstb_rpt_properties', scope)`; `findOne` tách 404 vs 403.

### D. Assignment flow
Dùng lại module data-access hiện tại: gán record cho role (`data_access_roles`) hoặc user (`data_access_users` + permission_id=view). Không cần code gán mới.

## Behavior
- super_admin: tất cả.
- role có `ma_tool_report_view` + `data_access_roles` grant: chỉ record được gán.
- user exception `data_access_users(view)`: cộng/trừ theo user.
- không grant: không thấy (default-deny, giống diagnostic).

## Reference files (scout)
- Entity: `src/modules/databases/ma-tool-cstb-rpt-property.entity.ts` (đã tồn tại; có FK `data_service_center_id`).
- `src/modules/data-access/constants/hierarchy-config.ts` (HIERARCHY_MAP, ROOT_OWNER_CONFIG, NAME_COLUMN_MAP, ALLOWED_TABLES).
- `src/common/enums/data-access-table.enum.ts`.
- `src/common/authorization/...`: PermissionGuard, DataAccessInterceptor, permission-query.service.ts, data-scope-applier.ts.
- Reference module: `src/modules/bi-hub-diagnostic-report/*` (pattern controller/service/dataScope).
- Seeders: `src/seeders/module.seeder.ts`, `src/seeders/permission.seeder.ts`.

## Future extension (không làm bây giờ)
Muốn SO auto-own theo `data_service_center`: thêm `ma_tool_data_service_centers` vào `ROOT_OWNER_CONFIG` + đổi HIERARCHY_MAP cho report trỏ cha `data_service_center_id`. Thiết kế hiện superset-ready.

## Success criteria
- User có role gồm `ma_tool_report_view` + được gán N record → `GET /ma-tool/report` trả đúng N record đó; record khác không lộ.
- `GET /ma-tool/report/:id` ngoài scope → 403; id không tồn tại → 404.
- super_admin thấy tất cả.
- Không phát sinh nhánh ownedRoots (verify DataScope.ownedRoots = null cho bảng này).

## Unresolved questions
- Module/permission id cụ thể (impl detail — verify max hiện tại lúc code).
- Route naming cuối cùng (`ma-tool/report` vs `ma-tool/cstb-rpt-property`) — tạm chốt `ma-tool/report`.
