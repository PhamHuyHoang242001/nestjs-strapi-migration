# Brainstorm Summary — Record-level Grant-Authority + Handover

Date: 2026-07-27 (revised — supersedes 2026-07-26 manage_access approach)
Status: Design approved (derive approach). Pending `/ck:plan` rewrite.
Scope focus: diagnostic first; descriptive = extension exemplar (doc-only, no config wiring yet).

## 1. Problem statement

Người tạo report cần **tự động** có quyền **phân quyền** (tạo/sửa/xoá `data_access` rule) cho report mình tạo, và **bàn giao** cho người khác khi đổi phòng.

## 2. FINAL approach — Derive manage from existing permissions (no new permission)

**Quyết định (user-confirmed 2026-07-27):** KHÔNG tạo permission `manage_access` mới. Suy ra quyền quản-lý-phân-quyền từ permission đã có:

```
canManageGrants(user, record) =
    super_admin
    OR SO (OwnerScopeResolverService.isInOwnedScope)
    OR ( editOnRecord(user, record) AND user holds <rule-verb theo API> )

editOnRecord = getAccessibleRecords(user, table, EDIT_CODE).includes(record)
```

### Vì sao khả thi (verified)
- Diagnostic edit = `bh_diag_report_edit`, **action=`update`**, module_id=8 (`permission.seeder.ts:161`).
- `CreatorAccessGrantService` cấp actions `['read','update','delete']` (`creator-access-grant.service.ts:10`) → creator **đã tự động có `bh_diag_report_edit` record-scope** qua đúng cơ chế hiện tại. **Không cần đụng creator-grant.**
- Descriptive tương tự: `bh_report_edit`, action=`update`, module_id=7.

### Gate theo từng API (user-confirmed)
| API | Gate |
|---|---|
| `/data-access/create` `/create-bulk` `/update` `/delete` `/remove-link` | editOnRecord ∧ `perm_data_access_create` (+ super_admin/SO) |
| `/data-access/list` (xem rule) | editOnRecord ∧ `perm_data_access_view` (+ super_admin/SO) |
| `/report-access/records/:table` (list record để chọn grant) | editOnRecord ∧ `perm_data_access_create` (+ super_admin/SO) |

### Nút điều khiển tách bạch
- `perm_data_access_create` (verb global, admin cấp) = ai được phân quyền.
- Người chỉ có edit mà **không** có verb này → sửa report được nhưng **không** phân quyền được.

## 3. Decisions (user-confirmed)

- Hướng: **derive từ edit + rule-verb** (bỏ manage_access mới). [2026-07-27]
- Độc quyền: **BỎ "1 owner độc quyền"** → manage = **editor** (nhiều editor có thể cùng quản). [2026-07-27]
- Handover = **gỡ edit (RUD) của A + cấp edit cho B** qua data_access rule sẵn có (tự chuyển quyền manage). Auth model chi tiết: bàn ở bước plan.
- Không thêm API mới — chỉ cải tiến API cũ.
- Config: `MANAGE_ENABLED_MODULES` = [diagnostic] → sau thêm descriptive.
- Descriptive: doc-only exemplar, **chưa** wire config (chưa có create-flow + cột creator).

## 4. Touchpoints

| File | Change |
|---|---|
| `data-access/constants/hierarchy-config.ts` | +`MANAGE_ENABLED_MODULES` (theo module/table) + helper |
| `data-access/data-access.service.ts` | gate create/update/delete/removeLink (editOnRecord ∧ create-verb); list (∧ view-verb); getScopedRecords/getRecords (∧ create-verb) + caller context |
| `data-access/data-access.controller.ts` | truyền caller {userId, isSuperAdmin, client} |
| `data-access/report-access-records.controller.ts` | records browser scope theo edit-accessible |
| `common/authorization/services/permission-query.service.ts` | fix junction `is_deleted` filter (C4) |
| handover | reuse create + removeLink (không API mới) — chi tiết ở plan |

**KHÔNG cần:** permission `manage_access`, migration/seeder cho perm mới, sửa creator-grant, loại-khỏi-role, re-grant guard.

## 5. Red-team findings — trạng thái dưới approach mới

| Finding | Trạng thái |
|---|---|
| C1 (role-grant manage), C2 (deny strip), H1 (super_admin-role auto), H4 (verb leak) | **Biến mất** — không còn permission manage_access |
| C3 (double-owner concurrency) | **Không áp dụng** — bỏ 1-owner độc quyền |
| C4 (junction is_deleted filter) | **Giữ fix** — correctness chung (`permission-query.service.ts:262`) |
| H3 (caller id-namespace: admin-client thiếu type, user.id≠users.id) | **Giữ fix** — gate cần userId+isSuperAdmin đúng namespace |
| H5 (backfill created_by_admin_id namespace) | **Giữ** nếu cần backfill RUD cho record cũ (edit) |
| H6 (cache staleness của gate) | **Giữ** — gate đọc getAccessibleRecords; cân nhắc đọc DB trực tiếp cho write-gate |
| H7 (rollout/feature-flag fail-closed) | **Giữ** — bật gate sau khi record cũ có edit-grant |
| M1/M2 (sai seeder file/prefix) | **Không áp dụng** (không seed perm mới) |

## 6. Acceptance criteria

1. Creator diagnostic (đã có edit record-scope) + có `perm_data_access_create` → tạo được rule cho report đó; user khác (có verb nhưng không edit-on-record) → **403** trên report đó.
2. User có edit-on-record nhưng **không** `perm_data_access_create` → không phân quyền được.
3. Handover: gỡ edit A + cấp edit B → B quản được, A hết quyền (cả sửa lẫn phân quyền).
4. `/data-access/list` chỉ trả rule của record user có edit (∧ view-verb); records browser chỉ trả record user edit-được (∧ create-verb).
5. super_admin & SO bypass.
6. Module ngoài `MANAGE_ENABLED_MODULES` giữ hành vi cũ.

## 7. Open questions (bàn ở plan)

1. Handover: reuse create+removeLink thủ công (2 call) hay 1 service method gộp? Auth (owner-self vs admin)?
2. `editOnRecord` chỉ tính record-scoped data_access edit, hay cả global-edit-verb qua role? (đề xuất: record-scoped; broad case dựa SO/super_admin).
3. Backfill record cũ: có cần cấp RUD (edit) cho diagnostic cũ theo `created_by_admin_id` không (nếu creator-grant chưa từng chạy cho chúng)?
