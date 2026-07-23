---
phase: 2
title: Step-Scope Core Rewrite
status: completed
priority: P1
effort: 6h
dependencies:
  - 1
---

# Phase 2: Step-Scope Core Rewrite

## Overview
Thêm map code MỚI + resolver own-aware, KHÔNG overload hằng số cũ. Đây là lõi quyết định doc/template nào visible + own-only.

Scoped BI Payment verification completed; repo-wide `tsc` still shows unrelated Role drift outside this plan's scope.

> Red-team fix (I): KHÔNG đổi shape `WORKSTEP_TYPE_PERM` (record→list) — nó được `viewCodesForWorkstep` (`step-scope.constants.ts:30`) + test `workstep-type-perm.spec.ts:8-31` truy cập theo record. Thêm hằng số MỚI `WORKSTEP_VIEW_CODES`, giữ `WORKSTEP_TYPE_PERM` cho create/own path tới khi phase 3–4 chuyển hết consumer, rồi mới dọn.
> Red-team fix (L): SO owner per-program (`step-scope.service.ts:36` `isInOwnedScope(userId,table,programId)`) — resolver mới PHẢI check SO theo từng programId, KHÔNG global flag.
> Red-team fix (F7-assumption): `resolveGlobalViewableWorksteps` (program-less, `:71`) dùng cho user-created cross-program — phải quyết own-behavior (xem phase 4).

## Mapping nghiệp-vụ (chốt, khớp code)
`step-scope.constants.ts:8-9`: RECON_DATA = sale (tra soát), RECON_FEEDBACK = bicc (feedback). Vậy:
- PREPARE + EX_PREPARE = "prepare" (user định nghĩa prepare gồm cả 2).
- RECON_DATA = "tra soát" → own-only cho `upload_recon`.
- RECON_FEEDBACK = "feedback" → chỉ `upload` full.

## Requirements
- Functional (own flag):
  - `bp_program_upload` (full) hoặc SO owner → mọi workstep, `own:false`.
  - `bp_program_upload_recon` → chỉ RECON_DATA, `own:true`.
  - `bp_program_approve` → PREPARE + EX_PREPARE, `own:false` (view để duyệt prepare docs).
  - `bp_program_confirm` → KHÔNG cấp view doc (confirm chỉ thao tác `pic-confirm-final-link`).
- Non-functional: giữ per-code cache; SO check per-program.

## Architecture
Thêm vào `step-scope.constants.ts`:
```ts
// View/upload codes theo workstep (model 8-quyền). Tách khỏi WORKSTEP_TYPE_PERM (giữ cho legacy tới phase 6).
export const WORKSTEP_VIEW_CODES: Record<MaToolWorkstepType, readonly string[]> = Object.freeze({
  PREPARE:        ['bp_program_upload', 'bp_program_approve'],
  EX_PREPARE:     ['bp_program_upload', 'bp_program_approve'],
  RECON_DATA:     ['bp_program_upload', 'bp_program_upload_recon'],
  RECON_FEEDBACK: ['bp_program_upload'],
});
export const OWN_ONLY_CODES = Object.freeze(new Set(['bp_program_upload_recon']));
```
Bỏ `WORKSTEP_BONUS_VIEW_BY_CODE` khỏi luồng mới (fix bonus-view). `viewCodesForWorkstep` cũ chỉ còn phục vụ legacy consumer tới phase 6.

`step-scope.service.ts` thêm:
```ts
async resolveWorkstepScopes(userId, programId): Promise<Map<MaToolWorkstepType, {own: boolean}>>
```
- SO owner (per-program `isInOwnedScope`) → mọi workstep `{own:false}`.
- Mỗi workstep, duyệt `WORKSTEP_VIEW_CODES[ws]`: nếu có code full (∉ OWN_ONLY_CODES) tại program → `{own:false}`; nếu chỉ có code own-only → `{own:true}`.
- Rỗng → `ForbiddenException` (giữ hành vi cũ) — LƯU Ý phase 4 sẽ cần biến thể không-throw cho Xem-only empty-200.
`resolveAllowedWorksteps(Set)` → derive `new Set(map.keys())` (giữ tạm cho call-site chưa cần own; phase 4 chuyển checkDocStep sang Map).

## Related Code Files
- Modify: `src/modules/bi-payment/common/step-scope.constants.ts` (thêm WORKSTEP_VIEW_CODES, OWN_ONLY_CODES)
- Modify: `src/modules/bi-payment/common/step-scope.service.ts` (resolveWorkstepScopes, SO per-program, global-view own)

## Implementation Steps
1. Thêm `WORKSTEP_VIEW_CODES` + `OWN_ONLY_CODES`. Giữ `WORKSTEP_TYPE_PERM`/`viewCodesForWorkstep` (legacy).
2. Thêm `resolveWorkstepScopes(userId, programId)` (Map own-aware, SO per-program).
3. Thêm biến thể `resolveWorkstepScopesOrEmpty` (không throw) — trả Map rỗng thay vì Forbidden, dùng cho Xem-only empty-200 (phase 4).
4. Cập nhật `resolveGlobalViewableWorksteps` dùng `WORKSTEP_VIEW_CODES`; trả kèm own-flag hoặc caller tự áp own (phase 4 quyết cho user-* cross-program).
5. Unit test resolver NGAY (own flag: upload→false, upload_recon→RECON_DATA true, approve→PREPARE/EX_PREPARE false, confirm→không cấp; SO per-program: SO-of-A + upload_recon-on-B → tại B own:true).
6. Compile `npx tsc --noEmit`.

## Success Criteria
- [x] `resolveWorkstepScopes` đúng own flag cho 4 code + SO per-program.
- [x] `WORKSTEP_VIEW_CODES` tách riêng, `WORKSTEP_TYPE_PERM` legacy KHÔNG đổi shape (consumer cũ + test cũ chưa vỡ).
- [x] Bonus-view không xuất hiện trong luồng mới (bicc-only không thấy RECON_DATA qua bonus).
- [x] SO-of-A + upload_recon-on-B: tại B chỉ own recon.
- [x] Unit test resolver xanh; repo-wide `tsc` warning recorded, unrelated Role drift remains outside BI Payment scope.

## Risk Assessment
- Own-only sai → rò doc (security). Mitigation: unit test resolver trước khi wire (bước 5).
- Global-view (user-*) own-handling bị bỏ quên → PII leak (phase 4 fix F). Ghi rõ ở đây để phase 4 nhận.
- Giữ 2 map (VIEW_CODES mới + TYPE_PERM cũ) tạm thời → dọn ở phase 6 để tránh 2-source-of-truth lâu dài.
