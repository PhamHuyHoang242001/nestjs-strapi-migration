---
phase: 3
title: Verify & regression
status: completed
priority: P1
effort: 1h
dependencies:
  - 2
---

# Phase 3: Verify & regression

## Overview
Chứng minh fix đúng authority predicate, không side-effect. Full suite + rà không còn write-path rule-management bỏ gate.

## Requirements
- Functional: mọi acceptance ở plan/brainstorm thoả; lỗ hổng gốc không tái hiện.
- Non-functional: 0 test đỏ ngoài ý muốn; typecheck/lint sạch vùng sửa.

## Architecture
Kiểm 3 lớp: (1) suite data-access đầy đủ; (2) authority-predicate đúng cho owner-chain + own-all + verb-per-action; (3) tĩnh.

## Related Code Files
- Read: `src/modules/data-access/__tests__/*`, `data-access.service.ts`.

## Implementation Steps
1. `npx jest src/modules/data-access` → toàn bộ PASS (gồm test Phase 1 giờ xanh).
2. **Authority-predicate check** (không phải browser-parity): caller edit-on-record/SO của `bi_hub_reports` → create/update thành công; ngoài quyền → 403. delete-only-editor → delete được (verb-per-action). own-all owner `ma_tool_cstb_rpt_properties` → create được; non-owner → 403.
3. **Rà write-path rule-management** khác có thể bỏ gate: grep `manager.save(DataAccess`, `insert(RoleDataAccess`, `insert(DataAccessUsers`, `.save(record` trong service. Xác nhận create/update/delete/removeLink đều qua gate; ghi rõ loại trừ `CreatorAccessGrantService` (self-grant lúc tạo record — ngoài threat-model quản-lý-rule) + handover (đã hard-reject non-manage `:1042`).
4. `npx tsc --noEmit` exit 0; `npx eslint` không lỗi mới vùng sửa (đối chiếu baseline).
5. Docs: nếu có tài liệu mô hình quyền data_access → note gate mở rộng + verb-per-action.

## Success Criteria
- [ ] `npx jest src/modules/data-access` toàn bộ PASS.
- [ ] Authority-predicate xác nhận cho owner-chain table + own-all table + verb-per-action (delete).
- [ ] Không path ghi rule-management nào bỏ qua gate (loại trừ có ghi rõ lý do).
- [ ] `tsc --noEmit` exit 0; không lỗi eslint mới.
- [ ] Lỗ hổng gốc không tái hiện (test đỏ Phase 1 giờ xanh).

## Risk Assessment
- Còn write-path ẩn không qua gate → bypass. Mitigation: bước 3 grep toàn diện + loại trừ có lý do.
- own-all/verb-per-action là nhánh mảnh dễ sai. Mitigation: bước 2 test cả owner/non-owner + create-verb/delete-verb.
