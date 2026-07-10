---
phase: 3
title: "Verify, provisioning & edge cases"
status: pending
priority: P1
effort: "3h"
dependencies: [2]
---

# Phase 3: Verify, provisioning & edge cases

## Overview
End-to-end verify + 3 blocker từ red-team: (1) provisioning path data_access rule scope program, (2) grep inventory 14 handler verb-gate-only, (3) edge cases + product confirm calculating/confirm_release. Cache verify.

## Requirements
- Functional: E2E (DB-mocked) verify 5+ scenario; edge cases; provisioning path confirm.
- Non-functional: cache hit verify; perf đo; code review.

## Architecture
Verify qua: unit/integration spec (phase 1-2), runtime smoke nếu có test DB, cache check, provisioning check, grep inventory.

## Related Code Files
- Read: `src/modules/bi-payment/document/__tests__/` (all specs)
- Read: `src/seeders/data-access.seeder.ts` (verify module_id coverage)
- Read: `src/modules/data-access/*.controller.ts` (admin endpoint tạo data_access rule?)
- Grep: `docRepo.` / `this.docRepo` across `src/modules/bi-payment/document/` (inventory 14 handler)
- Modify: spec bổ sung edge case + (nếu cần) seeder/admin note.

## Implementation Steps
1. **Provisioning path (Finding 4)** — verify CÓ cách tạo `data_access` rule scope program:
   - Grep `data-access` controller/admin: có endpoint tạo rule với `data_id` + `module_id`? Nếu CÓ → document trong phase 3 note "admin tạo rule scope program trước khi non-SO user dùng list-doc". Nếu KHÔNG → flag BLOCKER cho cook: cần seed/admin endpoint ở plan riêng HOẶC fallback empty-list (không 403) khi user có code nhưng chưa có rule.
   - **Fallback decision**: nếu không có provisioning path và không seed → sửa `resolveAllowedWorksteps`: nếu `getPermissions(userId)` (role-level code) chứa code nhưng `getAccessibleRecords` empty → return empty set, service trả empty list 200 (không 403). Chỉ 403 khi user có code nhưng `programId` cụ thể ∉ tập rule (out of scope). Refine phase 1 nếu cần.
   - Verify seeder: có seed `data_access` cho module_id=13 (bi_payment_programs)? Nếu không → thêm seed mẫu cho pilot (1 role × 1 program × 3 doc-code) để test non-SO path.
2. **Grep inventory (Finding 7)** — liệt kê 14 handler document verb-gate-only:
   - `grep -rn 'docRepo\.\|this\.docRepo' src/modules/bi-payment/document` → table: handler | StepScope-gated? (no, chỉ list) | verb-gate-only | deferred.
   - Append table vào `reports/handler-inventory.md`. Update plan.md claim "enforcement final LIST PATH ONLY".
3. **Edge case specs** (thêm phase 1-2 hoặc file mới):
   - User có `bp_program_calculating`@program (không map workstep) → list-doc → `resolveAllowedWorksteps` empty → 403. **Verify đúng** (không leak).
   - User 2 code (preparing + recon_sale)@program → allowed = {prepare, ex_prepare, recon_data}. List không workstep → IN 3.
   - SO owner bicc-A gọi list-doc program bicc-B → `isInOwnedScope` false → per-code check → 403 (cross-dept).
   - SO owner + NULL `template.workstep_type` doc → list (SO=ALL) → IN (4 enum), NULL excluded (Postgres `IN` không match NULL). **Verify**: nếu cần NULL doc → handle riêng (out of scope pilot).
4. Run full bi-payment suite → no regression.
5. **Cache verify**: spec assert `getAccessibleRecords` cache key per-code (3 distinct code → 3 key `perm:user:{uid}:da:bi_payment_programs:{code}`). Verify `RoleService.update` perm-change path: có invalidate `owner_scope`? (Finding 11) → nếu không, note accepted 120s window trong report, follow-up plan.
6. **Perf**: log `resolveAllowedWorksteps` time (3-4 getAccessibleRecords). Nếu >100ms → note follow-up reuse `getPermissions(userId)` 1-call pattern (như `BiPaymentTemplateService.resolveViewableWorksteps:198-204`).
7. `npm run build` + lint bi-payment scope → sạch.
8. Code review (delegate `code-reviewer` agent).
9. **Product confirm** (Finding 7 original): calculating-only/confirm_release-only user 403 list-doc — acceptable? Nếu product muốn họ thấy → follow-up plan map `program.workstep_current`.
10. Docs update (minor): `docs/permission-matrix-design.md` note pilot list-doc step-scope + 14-handler deferred + provisioning requirement.

## Success Criteria
- [ ] Provisioning path resolved (admin endpoint exists HOẶC fallback empty-list + seed mẫu).
- [ ] `reports/handler-inventory.md` — 14 handler table, deferred list.
- [ ] 4 edge case spec pass.
- [ ] Full bi-payment suite green.
- [ ] Cache key per-code verified; owner_scope invalidation gap documented.
- [ ] Perf logged.
- [ ] Build + lint pass.
- [ ] Code review DONE.
- [ ] Product confirm calculating/confirm_release (or follow-up noted).
- [ ] Docs updated.

## Risk Assessment
- **Finding 4 BLOCKER**: nếu không provisioning path + không fallback → non-SO user 403. Mitigation: step 1 quyết định fallback/seed/admin. CRITICAL — phải resolve trước cook.
- **14 handler deferred**: pilot list-doc xong KHÔNG có nghĩa module an toàn. download/details/delete vẫn verb-gate-only. Mitigation: inventory + follow-up plan rõ ràng, không oversell pilot.
- **Runtime smoke unavailable**: không test DB → dựa DB-mocked spec. Note limitation.
- **Perf 3N**: cache TTL 120s hấp hẫu. Defer optimize, note threshold.
- **NULL workstep_type doc**: SO thấy (IN 4 enum, NULL excluded = SO cũng không thấy NULL). Consistent SO/non-SO. Nếu product cần NULL doc → follow-up.
- **Regression**: chỉ list-doc đổi nhưng WORKSTEP_TYPE_PERM move → template service import updated phase 1 → full suite catch.
