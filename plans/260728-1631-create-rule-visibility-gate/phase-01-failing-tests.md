---
phase: 1
title: Failing tests
status: completed
priority: P1
effort: 2h
dependencies: []
---

# Phase 1: Failing tests (red)

## Overview
Viết test tái hiện lỗ hổng + test không-khóa-nhầm TRƯỚC khi vá. Test lỗ-hổng phải FAIL trên code hiện tại; test bảo-toàn phải PASS. Tránh test vacuous: nhánh own-all chạy code thật (`hasOwnerAllAssignment` → `this.connection.query`), phải mock `connection.query` (không mock cứng thành xanh).

## Requirements
- Functional: chứng minh gate hiện tại cho tạo/xóa rule không đúng quyền trên table non-manage.
- Non-functional: mock DataSource giống `records-browser-edit-scope.spec.ts` / `data-access-write-gate.spec.ts`; nhánh own-all không mock `hasOwnerAllAssignment` (nó ở service) — mock `connection.query` cho role lookup + sentinel probe.

## Architecture
Test tầng service `DataAccessService.create/update/delete/removeLink`. Mock `manageAuthority.filterManageableRecords` cho nhánh authority; mock `connection.query` cho role/sentinel; mock `usersRepo.findOne` cho super_admin resolve (id 1 = super_admin).

## Related Code Files
- Create: `src/modules/data-access/__tests__/create-rule-visibility-gate.spec.ts`
- Read (mẫu): `__tests__/data-access-write-gate.spec.ts`, `records-browser-edit-scope.spec.ts`
- Read (SUT): `data-access.service.ts` (`enforceManageGate` :92, `create` :625, `update` :732, delete :879, removeLink :954, `hasOwnerAllAssignment` :1493)

## Implementation Steps
1. **Red — lỗ hổng create:** caller có verb `perm_data_access_create`, `filterManageableRecords→[]` (không edit/SO/super) trên `bi_hub_reports` → `create({data_ids:[X]})` → kỳ vọng `ForbiddenException('not_record_manager')`. (Hiện: no-op → không throw → FAIL = đúng.)
2. **Red — lỗ hổng delete/removeLink:** caller có `perm_data_access_delete` + edit-on-record nhưng gate cũ hardcode create-verb → xác nhận hành vi verb-per-action: sau fix, delete-only-editor **được** xóa (không 403 sai). Test đỏ: trên code hiện tại delete cho `bi_hub_reports` không bị gate (no-op) → sau fix phải gate đúng theo delete-verb.
3. **Red — update:** tương tự create trên `bi_hub_reports` record ngoài quyền → 403.
4. **Green-đã-đúng — SO owner:** `filterManageableRecords` mock trả đủ ids → create thành công. PASS trước & sau.
5. **Green-đã-đúng — own-all (code thật):** table `ma_tool_cstb_rpt_properties`; mock `connection.query`: role lookup → `[{role_id:3}]`, sentinel probe (`hasOwnerAllAssignment`) → `[{...}]` (owner); `filterManageableRecords→[]`. → create thành công (pass qua nhánh own-all). Và ca non-owner: sentinel probe → `[]` → 403. Đây là guard cho roleIds-plumbing (Finding E).
6. **Green — super_admin:** `usersRepo.findOne(id 1)→SUPER_ADMIN` → create mọi rule. PASS trước & sau.
7. **All-or-nothing:** `data_ids=[owned, not_owned]` → reject cả lô (403).
8. **Regression — diagnostic_reports:** editor edit-on-record tạo được; non-editor 403; super_admin all. PASS trước & sau.

## Success Criteria
- [ ] Test lỗ-hổng (1-3) FAIL trên code hiện tại.
- [ ] Test bảo-toàn (4-8) PASS trên code hiện tại (own-all ca owner/non-owner đúng).
- [ ] Own-all test chạy `hasOwnerAllAssignment` thật (không mock cứng thành xanh) — đổi mock `connection.query` → đổi kết quả test.
- [ ] Không dùng DB thật.

## Risk Assessment
- Mock lệch thực tế → xanh giả (Finding D). Mitigation: own-all test drive qua `connection.query` để chạy code thật; Phase 3 chạy full suite.
- Test verb-per-action cần phản ánh cả hành vi trước (no-op) và sau (gate) → chú thích rõ test nào đỏ-có-chủ-đích.
