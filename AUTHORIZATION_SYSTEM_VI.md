# Hệ thống Permission & Data Access Authorization

Tài liệu này phản ánh hành vi hiện tại của `src/common/authorization` và các gate BI Payment đã chốt trong code. Trọng tâm: `PermissionGuard` dùng **OR semantics**, child records luôn scope theo parent `bi_payment_programs`, và BI Payment permission matrix đã rút về 8 code nghiệp-vụ.

## Luồng xử lý

```text
Request
  -> BearerGuard xác thực JWT và set req.info.user, req.info.client
  -> PermissionGuard kiểm tra @RequirePermission(...)
  -> DataAccessInterceptor gắn req.info.dataScope cho @RequireDataAccess(...)
  -> Controller / Service xử lý business logic
```

## Quy tắc lõi

| Quy tắc | Hành vi hiện tại |
| --- | --- |
| `@RequirePermission(...codes)` | `PermissionGuard` pass nếu user có **ít nhất một** code trong danh sách. Không phải AND. |
| Super admin | `users.type === 'super_admin'` bypass verb gate. |
| Data access | `deny` luôn thắng `allow`. Rule không gắn permission cụ thể áp dụng cho mọi permission. |
| Cache Redis | Permission codes cache 300s. Data access ids cache 120s. |
| Child scope | Luôn đi qua parent `bi_payment_programs`; không so sánh program explicit IDs với child IDs. |

### Ví dụ OR semantics

```ts
@RequirePermission('bp_program_upload', 'bp_program_upload_recon')
```

Nghĩa là:

- đủ `bp_program_upload` là pass
- đủ `bp_program_upload_recon` là pass
- không cần cả hai

## BI Payment permission matrix

### 8 code đang dùng

| ID | Code | Ý nghĩa | Ghi chú |
| --- | --- | --- | --- |
| 39 | `bp_program_view` | Xem | Base gate cho list/report. |
| 40 | `bp_program_create` | Tạo mới | Program create. |
| 41 | `bp_program_edit` | Sửa | Gộp `next_step`, `calculating`, các PATCH workstep của program. |
| 42 | `bp_program_delete` | Xóa | Program delete. |
| 49 | `bp_program_upload` | Upload | Full upload, merge, checklist CRUD, comment, other-file. |
| 52 | `bp_program_upload_recon` | Upload tra soát | Chỉ `RECON_DATA` docs do chính mình upload; template recon vẫn full-view. |
| 53 | `bp_program_approve` | Approve | Duyệt/từ chối document `PREPARE`/`EX_PREPARE` đã submit + checklist approval. |
| 54 | `bp_program_confirm` | Confirm | Chỉ `pic-confirm-final-link`. |

### Template verbs còn tách riêng

| ID | Code | Ghi chú |
| --- | --- | --- |
| 50 | `bp_template_create` | Tạo template, độc lập với content-view. |
| 51 | `bp_template_delete` | Xóa template, độc lập với content-view. |

## BI Payment behavior đã chốt

### Document

| Endpoint / rule | Behavior |
| --- | --- |
| `list`, `stats` | Nếu user chỉ có view/base gate nhưng không có content capability, service trả `200` với `data: []`, `total: 0` thay vì `403`. |
| `details`, `download` | Vẫn cần content capability; view-only không đủ. |
| `upload` | `bp_program_upload` cover toàn bộ workstep; `bp_program_upload_recon` chỉ cover `RECON_DATA` và chỉ own-doc (`uploaded_by_id = self`). |
| `update-status` | Chỉ chạy khi `BiPaymentProgressStatus.INPROGRESS`. `approval/rejected` chỉ áp cho `PREPARE` + `EX_PREPARE` và require `bp_program_approve`. |
| `user-created` / `user-updated` / `user-approved` / `user-rejected` | Trả distinct users theo cột `uploaded_by_id`, `updated_by_id`, `approved_by_id`, `rejected_by_id`. |
| delete route | Đã bỏ. Route static luôn đứng trước dynamic `:id`. |

### Template

| Endpoint / rule | Behavior |
| --- | --- |
| `search` | Step×program scope. `bp_program_view` alone không mở content nếu service không có workstep capability. |
| `details`, `download` | Cần content capability (`bp_program_upload` hoặc `bp_program_upload_recon`). |
| `create`, `duplicate-many` | Dùng `bp_template_create`. Không phụ thuộc content-view. |
| `delete`, `delete-many` | Dùng `bp_template_delete`. Không phụ thuộc content-view. |
| `user-created`, `user-updated` | Distinct users, không trả template rows. |

### Checklist / comment / other-file

| Area | Rule |
| --- | --- |
| Checklist CRUD | Dùng `bp_program_upload`. |
| Checklist approval | Dùng `bp_program_approve`; body `programId` active tất cả checklist rows chưa xóa mềm của program đó. |
| Comment / other-file | Dùng `bp_program_upload`. |

### Program confirm

| Endpoint | Gate |
| --- | --- |
| `PATCH /bi-payment/program/pic-confirm-final-link` | Chỉ `bp_program_confirm`. |

## Parent-scope examples

Child records luôn đọc quyền từ parent program, rồi mới lọc record con.

| Child area | Parent key |
| --- | --- |
| Checklist | `program_id` |
| Document | `program_id` |
| Template | `bi_payment_program_id` |
| Comment / other-file / history / program-step | `program_id` hoặc bảng program/hierarchy tương ứng |

### Luôn đúng

- resolve access trên `bi_payment_programs`
- sau đó mới scope child rows bằng parent id
- không compare program explicit ids với child ids

## Migration & rollout

### Active add migration

| File | Facts đã verify |
| --- | --- |
| `src/migration/1784797200000-add-bi-payment-program-permissions.ts` | Timestamp 13 digits, lookup physical table động (`permissions` / `permission`), chặn schema ambiguity, fail closed khi collision id/module, down cleanup FK-safe. |

### Deferred cleanup migration

| File | Facts đã verify |
| --- | --- |
| `src/deferred-migrations/1784804400000-remove-legacy-bi-payment-program-permissions.ts` | Cố ý nằm ngoài glob active. Chỉ move sang `src/migration/` ở release cleanup sau khi manual re-grant đã smoke pass. |

### Safe order

1. Preflight live schema bằng `to_regclass` cho `permissions` / `permission`, `role_permissions` / `roles_permissions`, `data_access_users`.
2. Deploy code + add migration.
3. Admin manually grant new codes while legacy codes still exist.
4. Flush Redis prefix `perm:user:*`.
5. Smoke matrix.
6. Later cleanup release: activate deferred cleanup migration.
7. Remove old grants/definitions.
8. Flush cache lại.
9. Smoke matrix lại.

### Rollback rule

- Nếu issue xảy ra trước cleanup release: down migration add-code, re-flush cache, giữ legacy codes.
- Nếu issue xảy ra sau cleanup release: down deferred cleanup migration chỉ restore legacy definitions; assignments vẫn phải re-grant tay.

## Verification status

| Check | Status |
| --- | --- |
| Jest BI Payment + migration spec | Passed: 20 suites, 167 tests, 0 failed. |
| Full repository Jest | 65/69 suites, 602/604 tests passed; 4 failing suites nằm ngoài BI Payment. |
| `git diff --check` | Passed. |
| ESLint on changed runtime/migration sources | Passed. |
| ESLint on changed test specs | Strict lint still has mock typing / `unsafe-any` issues; Jest compile/run remains green. |
| repo-wide `tsc` | Still has pre-existing unrelated Role property errors. |
| PostgreSQL live migration / smoke | Not run here. |
| Coverage | Command chạy và tests pass, nhưng reporter chỉ trả `All files 0%`; per-file coverage chưa xác minh được. |

## References

- [BI Payment program permission rebuild plan](plans/260723-1600-bi-payment-program-permission-rebuild/plan.md)
- [Rollout checklist](plans/260723-1600-bi-payment-program-permission-rebuild/reports/rollout-checklist.md)
- [Test summary](plans/260723-1600-bi-payment-program-permission-rebuild/reports/test-summary.md)
