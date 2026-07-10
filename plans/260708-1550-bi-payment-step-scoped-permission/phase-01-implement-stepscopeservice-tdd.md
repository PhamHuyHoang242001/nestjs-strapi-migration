---
phase: 1
title: "Implement StepScopeService (TDD)"
status: pending
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Implement StepScopeService (TDD)

## Overview
TDD: spec-first → implement `StepScopeService` (2 method `resolveAllowedWorksteps` + `assertWorkstep`). Reuse `isInOwnedScope` (không custom query). Move `WORKSTEP_TYPE_PERM` vào const file riêng freeze.

## Requirements
- Functional:
  - `resolveAllowedWorksteps(userId, programId) → Set<MaToolWorkstepType>`: SO own-all via `ownerScope.isInOwnedScope(userId,'bi_payment_programs',programId)` → return ALL workstep_type; else per-code `getAccessibleRecords(userId,'bi_payment_programs',code)` check.
  - 403 vs empty: program ngoài scope (user có code, programId ∉ tập được gán) → throw ForbiddenException; user có code qua role nhưng CHƯA có rule nào tại bất kỳ program → throw ForbiddenException cũng OK **cho list-doc** (vì programId required, user gọi program cụ thể mà không có rule = ngoài scope). Empty-list semantics do service list xử lý khi allowed empty + isOwner=false: **throw 403** (giữ thống nhất — không có code mapped tại program = không được xem doc program đó).
  - `assertWorkstep(userId, programId, workstepType) → void`: throw nếu `workstepType ∉ allowed`.
- Non-functional: DB-mocked composition spec. Verify: (a) return shape, (b) `getAccessibleRecords` call args (đúng code), (c) `isInOwnedScope` call args. **Không có real-DB harness** (verify `orm.config.ts` JEST_WORKER_ID branch chỉ switch entity path, không connect DB).

## Architecture
```
// step-scope.constants.ts
export const WORKSTEP_TYPE_PERM: Readonly<Record<MaToolWorkstepType, string>> = Object.freeze({
  [MaToolWorkstepType.PREPARE]: 'bp_program_preparing',
  [MaToolWorkstepType.RECON_DATA]: 'bp_program_reconciliation_sale',
  [MaToolWorkstepType.RECON_FEEDBACK]: 'bp_program_reconciliation_bicc',
  [MaToolWorkstepType.EX_PREPARE]: 'bp_program_preparing',
});
export const ALL_WORKSTEP_TYPES = Object.values(MaToolWorkstepType);

// step-scope.service.ts
@Injectable()
export class StepScopeService {
  constructor(
    private permCache: PermissionCacheService,
    private ownerScope: OwnerScopeResolverService,
  ) {}

  async resolveAllowedWorksteps(userId, programId): Promise<Set<MaToolWorkstepType>> {
    // SO own-all via helper đã có soft-delete guard
    const isOwner = await this.ownerScope.isInOwnedScope(userId, 'bi_payment_programs', programId);
    if (isOwner) return new Set(ALL_WORKSTEP_TYPES);

    const allowed = new Set<MaToolWorkstepType>();
    for (const [wsType, code] of Object.entries(WORKSTEP_TYPE_PERM) as [MaToolWorkstepType, string][]) {
      const ids = await this.permCache.getAccessibleRecords(userId, 'bi_payment_programs', code);
      if (ids.includes(programId)) allowed.add(wsType);
    }
    if (allowed.size === 0) throw new ForbiddenException('No permission for program');
    return allowed;
  }

  async assertWorkstep(userId, programId, workstepType): Promise<void> {
    const allowed = await this.resolveAllowedWorksteps(userId, programId);
    if (!allowed.has(workstepType)) throw new ForbiddenException('No permission for workstep');
  }
}
```

## Related Code Files
- Create: `src/modules/bi-payment/common/step-scope.constants.ts` (WORKSTEP_TYPE_PERM frozen + ALL_WORKSTEP_TYPES)
- Create: `src/modules/bi-payment/common/step-scope.service.ts`
- Create: `src/modules/bi-payment/common/step-scope.module.ts` (provider + exports StepScopeService)
- Create: `src/modules/bi-payment/common/__tests__/step-scope.service.spec.ts`
- Modify: `src/modules/bi-payment/document/bi-payment-document.service.ts` (remove local WORKSTEP_TYPE_PERM → `export { WORKSTEP_TYPE_PERM } from '../common/step-scope.constants'` cho backward compat)
- Modify: `src/modules/bi-payment/template/bi-payment-template.service.ts` (update import path → `../common/step-scope.constants`, 5 call sites: lines 4, 35, 49, 165, 201-202)
- Modify: `src/modules/bi-payment/bi-payment.module.ts` (import StepScopeModule)

## Implementation Steps
1. **Drift-check 15'** (replaces old "Research" phase): re-read `permission-cache.service.ts` (getAccessibleRecords signature), `owner-scope-resolver.service.ts:185-231` (isInOwnedScope), `hierarchy-config.ts` (findRootTable + ROOT_OWNER_CONFIG). Halt + update plan nếu signature khác brainstorm.
2. Create `step-scope.constants.ts` with frozen map.
3. **TDD — write spec** (`step-scope.service.spec.ts`):
   - Test 1: SO owner (`isInOwnedScope` mock true) → allowed = ALL 4 workstep_type. Assert `isInOwnedScope` called với `('bi_payment_programs', programId)`. Assert KHÔNG gọi `getAccessibleRecords`.
   - Test 2: non-SO, `getAccessibleRecords(code='bp_program_preparing')` returns `[programId]`, others `[]` → allowed = {prepare, ex_prepare}.
   - Test 3: non-SO, all `getAccessibleRecords` return `[]` → throw ForbiddenException.
   - Test 4: `recon_data` code tại program → allowed = {recon_data}.
   - Test 5: `assertWorkstep` ws ngoài allowed → throw; ws trong allowed → resolve.
   - Test 6: SO owner + `assertWorkstep` bất kỳ → pass (own-all, assertWorkstep returns).
4. Run spec → fail (service chưa có).
5. Implement `step-scope.service.ts` + `step-scope.module.ts`.
6. Move WORKSTEP_TYPE_PERM: re-export từ `bi-payment-document.service.ts`, update import `bi-payment-template.service.ts` → const file. **Bắt buộc** chạy `workstep-type-perm.spec.ts` (import path cũ) → phải pass unmodified.
7. Wire `StepScopeModule` vào `bi-payment.module.ts`.
8. `npm run build` → compile sạch.

## Success Criteria
- [ ] 6 test case pass.
- [ ] `isInOwnedScope` dùng (không custom query `programRepo.biccDeptOf`).
- [ ] `WORKSTEP_TYPE_PERM` frozen const file riêng; template service import updated; `workstep-type-perm.spec.ts` pass unmodified.
- [ ] Build pass, no TS error.
- [ ] Drift-check done (signature confirm or plan updated).

## Risk Assessment
- **Mock vs real DB** (memory convention): spec assert cả return shape + call args. `orm.config.ts` JEST_WORKER_ID chỉ switch entity path — không real-DB harness, DB-mocked đúng.
- **SO overscope**: `isInOwnedScope` đã có soft-delete guard mỗi hop (`:213-215, :223`). Test 1 verify đúng tableName+programId arg. Không roll custom query → không rủi ro soft-deleted bicc_dept match.
- **calculating/confirm_release**: không trong WORKSTEP_TYPE_PERM → user chỉ 2 code → allowed empty → throw 403. ĐÚNG spec (list-doc không cho 2 code này). Document test comment. Verify product phase 3.
