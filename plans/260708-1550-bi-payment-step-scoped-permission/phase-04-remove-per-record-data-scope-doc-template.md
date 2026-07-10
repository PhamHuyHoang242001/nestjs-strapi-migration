# Phase 04 — Remove per-record data-scope on doc + template (step×program scoped)

## Context Links
- Parent plan: `./plan.md`
- Root cause discussion: `/ask` analysis (non-SO `list` docs → `1=0` because `applyDataScope` on `bi_payment_documents` with no rules)
- Related: `phase-02-wire-list-doc-tdd.md`, `step-scope.constants.ts` (`viewCodesForWorkstep`)

## Overview
- Priority: high
- Status: pending
- Bỏ lớp per-record data-scope (`@RequireDataAccess` trên doc/template table + `applyDataScope`/`assertInScope` calls) ở doc + template.
- Nguyên tắc mới: **có quyền step trong program → thấy/toạn tác với toàn bộ doc/template của step đó trong program**. Visibility = step×program. Không check từng record.

## Key Insights
- Doc `list` (controller:38) gắn `@RequireDataAccess(BI_PAYMENT_DOCUMENTS)` + service:86 `applyDataScope` → đây là nguồn bug `1=0`.
- 14 endpoint doc khác (details/download/delete/merge/stats/user-created...) đã dùng `@RequireDataAccess(BI_PAYMENT_PROGRAMS)` + `assertProgramInScope` (program-scope, OK). Chỉ cần nâng lên step-scope cho single-record write/delete.
- Template `search` hiện global-by-step (không lọc program). User chọn: **chuyển sang program-scoped** → thêm `programId` vào signature + filter.
- Template `details`/`download` có `assertInScope` (per-record) → bỏ, thay bằng step×program check.
- `WORKSTEP_TYPE_PERM` (create/own gate) giữ nguyên. Bonus view (`viewCodesForWorkstep`) đã có từ phase trước.

## Requirements
### Functional
- Doc `list`: non-SO có step-code tại program → thấy toàn bộ doc của step đó (không `1=0`).
- Doc single-record (download/delete/updateStatus): có step quyền → thao tác doc step đó (load workstep qua template join).
- Template `search`: lọc theo program + workstep (user có step tại program → thấy template step đó).
- Template `details`/`download`: có step quyền tại program của template → truy cập.
- SO owner: thấy/toạn tác toàn bộ (own-all) — behavior giữ.

### Non-functional
- Không phá `@RequirePermission` verb gate (giữ).
- Không phá `OwnerScopeGuard` (template `delete` vẫn dùng `@RequireOwnerScope` — tạo/delete template là own op, giữ).
- Không thêm DB migration.

## Architecture
- Bỏ `DataAccessInterceptor` khỏi doc controller + template controller `search/details/download/user-created/user-updated`? 
  - **KHÔNG** bỏ interceptor globally — các endpoint doc dùng `@RequireDataAccess(BI_PAYMENT_PROGRAMS)` vẫn cần `dataScope` cho `assertProgramInScope`. 
  - Thay vì bỏ interceptor: **bỏ `@RequireDataAccess` decorator + `applyDataScope`/`assertInScope` per-record calls**, thay bằng `stepScope` check trực tiếp. Interceptor trở thành no-op khi không có `@RequireDataAccess` meta (data-access.interceptor.ts:37).
  - Endpoint doc còn lại (details/download/delete/stats/merge/user-created) ĐANG dùng `assertProgramInScope(programId, scope)` — scope này đến từ `@RequireDataAccess(BI_PAYMENT_PROGRAMS)`. **Giữ** cho các endpoint này (đã đúng: program-scope).
  - Quyết định: doc `list` → bỏ `@RequireDataAccess` + `applyDataScope`, chỉ giữ workstep filter. Doc single-record → chuyển `assertProgramInScope` → `assertWorkstep` (step check). Template → bỏ `assertInScope`, thêm program filter + `canViewWorkstep`.

## Related Code Files
### Modify
- `src/modules/bi-payment/document/bi-payment-document.controller.ts` — list: gỡ `@RequireDataAccess(BI_PAYMENT_DOCUMENTS)`. single-record: chuyển `@RequireDataAccess(TABLE=PROGRAMS)` (giữ) nhưng service dùng step check.
- `src/modules/bi-payment/document/bi-payment-document.service.ts` — `list`: bỏ `applyDataScope(qb,'d',DOC_TABLE,scope)` + `scope` param. `download`/`delete`/`updateStatus`: thay `assertProgramInScope` → `assertDocStep(userId, doc)` (load doc.template.workstep_type, check `assertWorkstep(uid, programId, wt)`). `userScopedDocs`: bỏ `applyDataScope`, thêm program+step filter.
- `src/modules/bi-payment/template/bi-payment-template.controller.ts` — `search`: thêm `@Query('programId')`. `details`/`download`/`userCreated`/`userUpdated`: gỡ `@RequireDataAccess`.
- `src/modules/bi-payment/template/bi-payment-template.service.ts` — `search`: thêm `programId`, filter `t.bi_payment_program_id = :pid` + `resolveViewableWorksteps`→`assertWorkstep`. `details`/`download`: bỏ `assertInScope`, thay `canViewWorkstep` đã có. `userScopedTemplates`: bỏ `applyDataScope`, thêm program filter (cần programId param → user-created/updated cũng cần programId query).
### Tests
- `step-scope.service.spec.ts` — cập nhật nếu signature đổi.
- `bi-payment-document.service.step-scope.spec.ts` — bỏ assert `applyDataScope` predicate; thêm assert non-SO thấy doc khi có step-code.
- `workstep-type-perm.spec.ts` — giữ.
- Thêm test: non-SO list doc có step-code → query chỉ chứa `t.workstep_type IN (allowed)` + `program_id`, KHÔNG chứa `1=0`/`dsExplicit`/`EXISTS`.

## Implementation Steps
1. Doc `list`: gỡ `@RequireDataAccess(BI_PAYMENT_DOCUMENTS)` (controller:38); service `list` bỏ `scope` param + `applyDataScope` call; controller bỏ `dataScope` truyền.
2. Doc single-record: thêm `assertDocStep(userId, doc)` helper — load `doc.template.workstep_type` (join) + `stepScope.assertWorkstep(userId, doc.program_id, wt)`. Thay `assertProgramInScope(doc.program_id, scope)` trong download/delete/updateStatus.
3. Doc user-created/updated/approved/rejected: bỏ `applyDataScope` trong `userScopedDocs`; thêm filter `t.workstep_type IN (:...viewable)` (global step set, qua `resolveViewableWorksteps`-equivalent — KHÔNG program, không programId). Giữ global behavior.
4. Template `search`: thêm `programId` @Query + DTO field; service `search(scope,userId,workstepType,keyword)` → `search(userId, programId, workstepType, keyword)`; filter `t.bi_payment_program_id = :pid` + workstep (dùng `viewCodesForWorkstep`/`assertWorkstep`).
5. Template `details`/`download`: bỏ `assertInScope`; giữ `canViewWorkstep` (đã có từ phase trước) + thêm program check (`assertWorkstep(uid, tpl.program_id, wt)`).
6. Template `userCreated`/`userUpdated`: bỏ `applyDataScope`; thêm programId filter.
7. Gỡ import `applyDataScope` + `DataScope` type nếu không còn dùng; gỡ `@RequireDataAccess` khỏi template search/details/download/user-created/user-updated.
8. Chạy typecheck + test; sửa test fail.

## Todo List
- [ ] Doc list: gỡ DA decorator + applyDataScope
- [ ] Doc single-record: assertDocStep helper
- [ ] Doc user-scoped: gỡ applyDataScope + program filter
- [ ] Template search: + programId param/filter
- [ ] Template details/download: gỡ assertInScope + step check
- [ ] Template user-scoped: gỡ applyDataScope + program filter
- [ ] Gỡ dead imports/decorators
- [ ] Typecheck + test pass

## Success Criteria
- Non-SO có `bp_program_reconciliation_bicc` tại program 5 → `list` docs trả doc `recon_feedback`+`recon_data` (không `1=0`).
- Non-SO có `bp_program_preparing` tại program 5 → `download`/`delete` doc prepare-step OK; doc recon_feedback → 403.
- Template `search?programId=5` → chỉ template program 5, step user có quyền.
- SO owner → all (giữ).
- Test cũ pass (sau update) + test mới pass.

## Risk Assessment
- **Frontend break**: template search thêm required `programId` → FE phải truyền. Mitigation: `programId` optional? Không — program-scoped buộc required (list-docs đã required). Coordinate with FE.
- **user-created/updat endpoints**: giữ GLOBAL (user chọn). Sau khi bỏ `applyDataScope`, filter chỉ còn `where` theo user + không cần programId. **Nhưng global → user có thể thấy doc ở program không có quyền** → cần filter workstep: chỉ doc có `template.workstep_type` thuộc tập step user có quyền **global** (qua `viewableWorksteps = resolveViewableWorksteps`, không per-program). FE không cần đổi.
- **Template `delete`**: giữ `@RequireOwnerScope` (create/delete = own op). Không đụng.

## Security Considerations
- Bỏ per-record check: user có step quyền tại program thấy TẤT cả doc step đó trong program (kể cả doc người khác tạo). Đây là yêu cầu user → chấp nhận.
- SO owner vẫn own-all (giữ qua `resolveAllowedWorksteps` trả `ALL_WORKSTEP_TYPES`).

## Next Steps
- Làm rõ user-created/updat programId (required hay global) trước khi code.
- Implement theo steps, test từng endpoint.
