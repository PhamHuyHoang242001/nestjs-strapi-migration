---
phase: 5
title: "Descriptive exemplar (doc-only)"
status: completed
priority: P3
effort: "0.25d"
dependencies: [2, 3]
---

# Phase 5: Descriptive exemplar (doc-only)

<!-- Updated: Validation Session 1 — backfill + feature-flag HOÃN (Deferred). Round này chỉ làm logic gate chuẩn. -->

## Overview
Ghi tài liệu cách mở rộng cơ chế grant-authority (derive) sang `bi_hub_reports` (descriptive) làm exemplar. **Không** wire config, **không** code — chỉ tài liệu, vì descriptive chưa có create-flow + cột creator trong repo.

## Scope note (đã chốt Validation Session 1)
- **Backfill** edit-grant cho diagnostic cũ (created_by_admin_id) → **HOÃN** (Deferred, làm khi go-live production có data cũ). Xem `plan.md` §Deferred.
- **Feature-flag rollout** per-module → **HOÃN** (Deferred). Round này bật gate trực tiếp cho `MANAGE_ENABLED_MODULES` (môi trường dev / logic-first).

## Requirements
- Functional: tài liệu bước mở rộng sang descriptive: (1) thêm `bi_hub_reports` vào `MANAGE_ENABLED_MODULES`; (2) đảm bảo có luồng tạo record + cột creator để creator tự có edit; (3) không cần code lõi mới (gate/handover config-driven đã áp).
- Non-functional: không thay đổi runtime; chỉ doc.

## Architecture
- Cơ chế derive đã config-driven → mở rộng = thêm 1 dòng config + đảm bảo create-flow gọi `creator-access-grant` (cấp RUD/edit). Không sửa gate/handover.
- Blocker descriptive (verify lại khi cần): `bi-hub-descriptive-report.entity.ts` không có cột creator; không có create-service trong repo (chỉ đọc/join ở `bicc-department.service.ts`). Nguồn tạo record khả năng ở service khác.

## Related Code Files
- Modify: `plan.md` / `README.md` hoặc `docs/` — ghi hướng dẫn mở rộng.
- Reference (no change): `bi-hub-descriptive-report.entity.ts`, `hierarchy-config.ts` (RULE_TARGET_TABLES đã chứa bi_hub_reports).

## Implementation Steps
1. Viết mục "Mở rộng sang bảng/service khác" trong doc: các bước config + điều kiện create-flow/creator column.
2. Ghi rõ blocker descriptive + nơi cần discovery (service tạo bi_hub_reports).

## Success Criteria
- [ ] Doc exemplar mô tả đủ bước mở rộng (config + create-flow + creator column).
- [ ] KHÔNG thêm `bi_hub_reports` vào `MANAGE_ENABLED_MODULES` (tránh nửa vời).

## Risk Assessment
- **Không tìm thấy create-flow descriptive** → doc-only, không block phần diagnostic (Phase 1–4).
