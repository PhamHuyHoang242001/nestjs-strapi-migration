---
phase: 4
title: FE permission wiring and config screen
status: completed
priority: P2
effort: 1d
dependencies:
  - 1
  - 2
  - 3
---

# Phase 4: FE permission wiring and config screen

## Overview
FE (`/Users/phamhoang/Documents/project-1/Mock-EDA-Portal-api-test/data-exchange/`, never edit the original `Mock-EDA-Portal`) hides actions the user cannot do, uses writable departments in the data-service form, and gets a department config screen (list + detail with members).

## Requirements
- `data-exchange-api.js` / `data-exchange-store.js`: `getMyPermissions()` (cached per page load), `listWritableDepartments(action)`, department-config CRUD + members + candidates; `ERROR_TEXT` for `DEPARTMENT_FORBIDDEN`, `SUPER_ADMIN_ONLY`, `DEPARTMENT_CODE_EXISTS`, `DEPARTMENT_IN_USE`, `INVALID_MEMBERS`, generic 403.
- Hide when flag false:
  - catalog/create entry "Tạo data service" (`data_service.create`), consumers "Tạo app thụ hưởng" (`consumer.create`), terms page "Tạo thuật ngữ chuẩn hoá" (`logical_term.create`), "Tạo thuật ngữ nghiệp vụ" (`physical_term.create`), "Nạp hàng loạt" (`import`).
  - Detail pages: edit/status buttons by `is_update`; physical delete by `physical_term.delete`; physical row actions in terms tab by flags.
- Data-service create/edit form: "Đơn vị phát hành" dropdown uses `departments/writable?action=create` (create) or `?action=update` (edit). Empty list → message "Bạn chưa được gắn vào đơn vị phát hành nào".
- New pages:
  - `data-exchange-department-config.html` — table (code, name, số thành viên, cập nhật), search, paging, create/edit modal, delete confirm; buttons by `department.*` flags; whole page requires `department.view`.
  - `data-exchange-department-config-detail.html?id=` — info + members table (email, badge Tạo / Update / Không có quyền), add-member picker from `member-candidates` showing the same badges, remove member confirm.
  - Sidebar/shell entry "Cấu hình đơn vị phát hành" shown only with `department.view`.
- Keep existing visual style; toasts via `api.showError`.

## Related Code Files
- Modify: `data-exchange-api.js`, `data-exchange-store.js`, `data-exchange-create.html`, `data-exchange-detail.html`, `data-exchange-catalog.html` (create button), `data-exchange-consumers.html`, `data-exchange-consumer-detail.html`, `data-exchange-terms.html`, `data-exchange-logical-term-detail.html`, `data-exchange-physical-term-detail.html`, shell/sidebar script.
- Create: the 2 config pages.

## Implementation Steps
1. API/store additions + error texts.
2. Flag-based hiding on each page (single helper `api.applyPermissionVisibility(map)` to avoid repetition).
3. Writable departments in create/edit form.
4. Config pages.
5. Browser check with a non-admin token (phase 5) and as super_admin (dev no-token).

## Success Criteria
- [ ] As super_admin: everything visible, config pages work end-to-end.
- [ ] As limited user: only permitted buttons visible; dept dropdown shows only member departments; direct API attempts → readable 403 toast.

## Risk Assessment
- FE dev calls have no token → always super_admin; need a way to send a test token (e.g. `localStorage` token read by `data-exchange-api.js`) — check how the API client attaches auth; add a dev-only token input if missing.
