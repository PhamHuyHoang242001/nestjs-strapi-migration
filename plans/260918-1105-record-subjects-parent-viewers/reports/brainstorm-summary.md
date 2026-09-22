---
title: Brainstorm — record-subjects roles/users (parent viewers)
date: 260918-1105
status: agreed
---

# Problem

Khi tạo record **không phải root** (vd `bi_hub_reports` dưới BICC), FE cần pick role/user **đã có quyền xem parent** để gắn grant lên child. Thiếu 2 read API. Không đổi write/create grant.

# Requirements (locked)

| Item | Decision |
|---|---|
| Output | `GET /v1/data-access/record-subjects/roles`, `GET /v1/data-access/record-subjects/users` |
| Query | `table` = **child** đang tạo (`bi_hub_reports`); `data_id` = **id parent** (BICC); `search`; `page`; `limit` |
| Parent resolve | `HIERARCHY_MAP[table].parentTable`. `parentTable == null` → 400 (root) |
| Viewer verb | Auto: permission `action=read` trên **module parent**. Không `permission_code` trên query |
| Who counts | Explicit-only: `role_data_access` ∪ `data_access_users`, **allow \ deny**. Không SO, không super_admin |
| Role semantics | Role gắn `role_data_access` trên **parent record** + hold parent VIEW |
| User expand | Member `user_roles` của role trên + user-exception; search **email ILIKE** |
| Role extra | `permissions[]` của role trên **module child** `{id,code,action}`; `user_count` = COUNT `user_roles` active (toàn role) |
| Table allow | Child ∈ `HIERARCHY_MAP` with parent; parent ∈ `RULE_TARGET_TABLES` |
| Code validate | Child module exists; parent VIEW code exists trên parent module. Sai → 400 |
| Gate | `@RequirePermission('perm_data_access_create')` only. **Không** `canManageRecord` / VIEW parent |
| Pagination | SQL DISTINCT id + LIMIT/OFFSET rồi hydrate. Cap `PERPAGE_MAXIMUM`. Cấm load full join RAM |
| Out of scope | Không sửa API khác; không auto-copy grant; không FE; không bật `MANAGE_ENABLED_MODULES` cho descriptive |

# Approaches evaluated

| | A PermissionQueryService paginated | B DataAccessService-only SQL | C reuse `getUsersByRecordPermission` + slice |
|---|---|---|---|
| | **Chosen** | Dup join logic | RAM nổ — reject |

# Solution

New paginated reverse lookup **siblings** of `getUsersByRecordPermission` (không sửa method cũ):

1. Resolve `parentTable` + `parentViewCode` (module parent, `action=read`; >1 read → 400 hoặc rule: đúng 1 view code/module).
2. Roles page: allow role ids on `(parentTable, data_id, parentViewCode)` minus deny; filter `role.name ILIKE search`; COUNT total; page; hydrate `{id,name,user_count,permissions}`.
3. Users page: allow user ids (role members ∪ dau) minus deny; filter email; page; hydrate `{id,email}`.
4. `permissions` child: `roles_permissions` ∩ `permission.module.table_name = child table`, `is_active`, not deleted.

Controller thin; service validate + call query.

# Risks

- `user_roles` fan-out → page **ids first**.
- Parent nhiều `action=read` → định nghĩa 1 code (prefer `*_view` / unique read).
- `user_count` toàn role ≠ số user đang view parent (accepted).
- Child table not in `RULE_TARGET_TABLES` nhưng parent is (vd leaf?) — round này child cũng phải là rule-target hoặc `ALLOWED_TABLES` with parent. **Lock:** child must have `HIERARCHY_MAP` parent; parent in `RULE_TARGET_TABLES`. Child không cần nằm `RULE_TARGET_TABLES` nếu chỉ dùng để lấy module permissions (vd tạo leaf?) — user example `bi_hub_reports` **is** rule-target. **Lock:** child ∈ `ALLOWED_TABLES` (có hierarchy), parent ∈ `RULE_TARGET_TABLES`.

# Success

- Tạo report: `table=bi_hub_reports&data_id=5` → roles/users có `bh_bicc_dept_view` explicit trên BICC 5; mỗi role có perm module 7 (`bh_report_*`) đã tick + `user_count`.
- Page 2 không giữ page 1 trong memory.
- Regression: `getUsersByRecordPermission` + data-access write APIs unchanged.

# Next

`/ck:plan --tdd` (permission query + existing reverse-lookup tests).

# Unresolved

- Nếu parent module có >1 permission `action=read`: fail 400 vs pick `code` ending `_view`. Prefer 400 nếu >1.
