---
phase: 2
title: "Wire list-doc (TDD)"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Wire list-doc (TDD)

## Overview
TDD: spec `BiPaymentDocumentService.list()` mới (StepScopeService) → sửa controller + DTO + service. Giữ field `workstep`, GIỮ `applyDataScope`, bỏ `@RequireDataAccess` (chỉ bỏ `assertProgramInScope` cũ). programId coerce số, phased rollout optional→required.

## Requirements
- Functional:
  - `programId` coerce số. V1: optional (omit → ? xem note); V2: required. Mặc định cook **V1 optional** để không break client, StepScopeService chạy per-program khi có programId. Khi omit programId → fallback cũ (verb gate + applyDataScope row-filter, không step-scope). **Decision: pilot yêu cầu programId enforcement → làm required ngay nhưng Phase 3 rollout gate.** Xem Risk.
  - `workstep` (giữ tên): optional `@IsEnum(MaToolWorkstepType)`.
  - Có `workstep` → `assertWorkstep` (403 nếu ngoài allowed) + filter `t.workstep_type = :wt`.
  - Không `workstep` → filter `t.workstep_type IN (:...allowed)`. SO owner → allowed = ALL_WORKSTEP_TYPES (luôn apply filter, không skip → NULL workstep_type không lệch).
  - **GIỮ `applyDataScope(qb,'d',DOC_TABLE,scope)`** — per-document DENY rules còn tác dụng. `scope` = `req.info.dataScope` từ interceptor.
- Non-functional: DB-mocked spec; verify StepScopeService inject + call đúng.

## Architecture
```
Controller list(@Query q, @Req req):
  programId = q.programId   // @Transform(()=>Number) + @IsInt + @Min(1), optional V1
  workstep = q.workstep     // @IsOptional @IsEnum(MaToolWorkstepType) — GIỮ field name
  return service.list(programId, q, req.info.user.id, workstep, req.info?.dataScope ?? null)

Service list(programId, query, userId, workstep?, scope):
  if !programId → throw BadRequestException('programId required')   // V2; V1 fallback xem Risk
  allowed = stepScope.resolveAllowedWorksteps(userId, programId)   // throw 403 nếu outside scope
  qb = docRepo.createQueryBuilder('d').innerJoin('d.template','t')
  qb.andWhere('d.program_id = :pid', { pid: programId })
  if workstep:
    if !allowed.has(workstep) → throw ForbiddenException
    qb.andWhere('t.workstep_type = :wt', { wt: workstep })
  else:
    qb.andWhere('t.workstep_type IN (:...allowed)', { allowed: [...allowed] })   // SO: ALL_WORKSTEP_TYPES
  applyDataScope(qb, 'd', DOC_TABLE, scope)   // GIỮ — per-doc DENY
  // + existing filters (search text, pagination)
  return qb.getManyAndCount()
```

## Related Code Files
- Modify: `src/modules/bi-payment/document/bi-payment-document.controller.ts:29-36` (bỏ `@RequireDataAccess(TABLE)`, truyền userId + workstep + scope)
- Modify: `src/modules/bi-payment/document/dto/search-bi-payment-document.dto.ts` (`programId`: `@IsOptional @Transform(()=>Number) @IsInt @Min(1)`; `workstep`: `@IsOptional @IsEnum(MaToolWorkstepType)` — GIỮ tên field)
- Modify: `src/modules/bi-payment/document/bi-payment-document.service.ts:41-67` (rewrite list; GIỮ applyDataScope)
- Modify: `src/modules/bi-payment/bi-payment.module.ts` (import StepScopeModule — KHÔNG có bi-payment-document.module.ts)
- Create/Modify: `src/modules/bi-payment/document/__tests__/bi-payment-document.service.step-scope.spec.ts`

## Implementation Steps
1. **TDD — write spec first**:
   - Test A: thiếu programId → BadRequest.
   - Test B: programId=NaN/0/-1 → BadRequest (`@Min(1)+@IsInt`).
   - Test C: user có `bp_program_preparing`@program, không gửi workstep → query `t.workstep_type IN (prepare,ex_prepare)` AND `applyDataScope` called với DOC_TABLE.
   - Test D: gửi `workstep=recon_data` nhưng chỉ preparing → ForbiddenException.
   - Test E: gửi `workstep=prepare` + có preparing → query `t.workstep_type = prepare`.
   - Test F: SO owner → allowed=ALL → query `t.workstep_type IN (all 4)` (KHÔNG skip filter). Assert applyDataScope vẫn called.
   - Test G: program ngoài scope (getAccessibleRecords trả [] cho mọi code) → ForbiddenException.
   - Test H: invalid workstep value (`workstep=foo`) → 400 (@IsEnum).
   - Test I: per-document DENY — mock applyDataScope thêm predicate, verify query chứa nó (regression cho Finding 3).
2. Run spec → fail.
3. Sửa DTO: `programId` `@IsOptional @Transform(({value})=>Number(value)) @IsInt @Min(1)`; `workstep` `@IsOptional @IsEnum(MaToolWorkstepType)`.
4. Sửa controller: bỏ `@RequireDataAccess(TABLE)`, truyền `req.info.user.id`, `q.workstep`, `req.info?.dataScope ?? null`.
5. Rewrite `service.list()` per architecture. Inject StepScopeService. **GIỮ `applyDataScope`**.
6. Import StepScopeModule vào `bi-payment.module.ts` (file duy nhất).
7. Run spec → all pass.
8. **Bắt buộc**: chạy `workstep-type-perm.spec.ts` + existing document specs → no regression.
9. `npm run build` → compile sạch.

## Success Criteria
- [ ] 9 test case pass (gồm per-doc DENY regression Test I).
- [ ] `@RequireDataAccess` removed; `applyDataScope` GIỮ trong list().
- [ ] DTO `workstep` field giữ tên, `programId` coerce `@IsInt @Min(1)`.
- [ ] Module ref `bi-payment.module.ts` (không bi-payment-document.module.ts).
- [ ] Existing specs pass.
- [ ] Build pass.

## Risk Assessment
- **Backward-compat programId required**: client cũ không programId → 400. **Mitigation**: pilot cook làm required ngay (spec Test A), NHƯNG coordinate deploy với client. Nếu không thể coordinate → cook V1 optional: omit programId → fallback verb gate + applyDataScope (behavior cũ), chỉ enforce step-scope khi programId có. Quyết định cook-time với team.
- **Backward-compat workstep invalid**: client gửi workstep value sai → trước ignore, sau 400. Breaking nhẹ. Mitigation: log + thông báo client.
- **applyDataScope retained**: không rủi ro Finding 3 (per-doc DENY sống sót). Test I regression guard.
- **verbFromExplicit flag**: PermissionGuard set flag dựa code; bỏ `@RequireDataAccess` không ảnh hưởng flag. Service không đọc flag → OK.
- **14 handler khác verb-gate-only**: pilot CHỈ list(). Phase 3 grep inventory + follow-up plan. KHÔNG claim "enforcement final toàn module".
