---
status: pending
title: Bi-Payment Step-Scoped Permission (programId + workstep) — Brainstorm Summary
date: 2026-07-08
---

# Problem

Hệ thống phân quyền bi-payment hiện tách 2 lớp rời rạc:
1. **Verb gate** (`PermissionGuard`) = check code-only (role.permissions ∪ user-exception ∪ SO owner-implied subtree). **Không** dính programId.
2. **Data-scope** (`DataAccessInterceptor` + `applyDataScope`) = lọc row theo record-id, ở service layer.

Hệ quả: user có code `bp_program_preparing` cho programId=2 nhưng KHÔNG có cho programId=1 vẫn **pass verb gate + thấy/truy cập program 1** (chỉ bị lọc row, mà row-filter dùng data-scope không gắn step-code).

Yêu cầu: **code X chỉ có hiệu lực tại program mà user được gán (role-via-data_access rule, hoặc SO own-all trong bicc dept), VÀ chỉ thấy content ở workstep mapped với code đó.**

# Ground truth (verified)

- `data_access.data_id` polymorphic qua `module_id` → `module.table_name` (không có cột table_name trên entity). `permission_id` nằm trên `data_access_users` (user-exception), KHÔNG có trên `data_access_roles` (role branch dùng `roles_permissions`).
- `@RequireDataAccess(table, permissionCode?)` đã hỗ trợ code arg. `DataAccessInterceptor` forward code → `getAccessibleRecords(userId, table, code)`. **Cả 2 branch (user + role) đều filter theo code** (`permission-query.service.ts:181-201`).
- Cache key `perm:user:{uid}:da:{table}:{code}` — 5 code khác nhau = 5 entry riêng (không collision). TTL 120s, invalidation by-pattern.
- `DataAccessInterceptor` early-return sạch khi handler không có `@RequireDataAccess` → `req.info.dataScope` undefined → `applyDataScope(scope=null)` no-op. **An toàn bỏ decorator trên endpoint dùng path service-layer.**
- Document **không có cột workstep**. Workstep = `template.workstep_type` (enum 4 giá trị: `prepare`, `recon_data`, `recon_feedback`, `ex_prepare`). Map hiện có `WORKSTEP_TYPE_PERM` (`bi-payment-document.service.ts:19-24`):
  - `prepare`, `ex_prepare` → `bp_program_preparing`
  - `recon_data` → `bp_program_reconciliation_sale`
  - `recon_feedback` → `bp_program_reconciliation_bicc`
  - `bp_program_calculating` + `bp_program_confirm_release` = **không có workstep_type upstream** (permission-only).
- Program có `workstep_current` enum 7 giá trị (lifecycle state) — KHÔNG dùng cho filter doc.
- Danh sách endpoint "content-of-a-program" (12 endpoint trực tiếp programId + các step-PATCH): comment list/create, document list/merge/stats/upload-status, checklist list/create/approve, other-file search/upload, program CRUD, program-step PATCH (preparing/calculating/reconciliation/waiting-for-approval/next-step/pic-confirm).

# Quyết định thiết kế (chốt với user)

| Quyết định | Chọn |
|---|---|
| Scope mode | **Cả 2**: programId + workstep |
| Workstep source | `template.workstep_type` (4 giá trị, map theo `WORKSTEP_TYPE_PERM`) |
| Role scoping | Role SO (owner bicc dept) = own-all mọi program trong dept. Role thường = quyền chỉ hiệu lực tại program có `data_access` rule gắn tới role đó (qua `roles_permissions` + data_access role branch). |
| No-programId list | **Bắt buộc truyền programId** → 400 nếu thiếu |
| Workstep filter mode | **Gate-only biến thể**: client gửi `workstepType` → gate theo code mapped; **KHÔNG gửi → trả tất cả docs/temps ở các workstep mà user CÓ code tại program đó** (union các workstep user có quyền) |
| Approach | **Service-layer** (`StepScopeService`), bỏ `@RequireDataAccess` trên pilot endpoint |
| `@RequirePermission` trên list-doc | Giữ 5 codes (không phá OR-semantics) |
| Rollout | Pilot list-doc trước, mở rộng dần (design doc bao phủ logic chung cho toàn bộ content-of-a-program) |

# Approach: Service-layer StepScopeService

## Nguyên lý

Verb gate (`@RequirePermission`) giữ nguyên — code-only pass. Enforcement thật = **service layer** dùng `StepScopeService`:
1. Lấy `programId` (bắt buộc).
2. Kiểm program thuộc scope user: `getAccessibleRecords(userId, 'bi_payment_programs', code)` ∪ `getOwnedRoots(userId, rootTable)` cho từng code liên quan.
3. Xác định tập `workstepTypes` user được phép tại program đó (map từ code → workstep_type, lọc theo code user thực có tại program).
4. Apply filter: `WHERE template.workstep_type IN (:allowedWorksteps)` (gate khi client gửi workstepType cụ thể → kiểm nó thuộc allowed set; không gửi → filter IN allowed set).

## Pseudocode — StepScopeService

```ts
// src/modules/bi-payment/common/step-scope.service.ts
const WORKSTEP_TO_CODE: Record<MaToolWorkstepType, string> = WORKSTEP_TYPE_PERM;

@Injectable()
export class StepScopeService {
  constructor(
    private permCache: PermissionCacheService,
    private ownerScope: OwnerScopeResolverService,
  ) {}

  // Trả set workstep_type user được phép tại program.
  // ném ForbiddenException nếu program ngoài scope (không có code nào tại program).
  async resolveAllowedWorksteps(userId, programId): Promise<Set<MaToolWorkstepType>> {
    const rootTable = findRootTable('bi_payment_programs'); // bi_hub_bicc_departments
    const ownedRoots = await this.ownerScope.getOwnedRoots(userId, rootTable);
    const isOwner = await this.programUnderOwnedRoots(programId, ownedRoots); // SO own-all

    const allowed = new Set<MaToolWorkstepType>();
    for (const [wsType, code] of Object.entries(WORKSTEP_TO_CODE)) {
      // SO own-all: skip per-code data_access check, gán luôn
      if (isOwner) { allowed.add(wsType as MaToolWorkstepType); continue; }
      const ids = await this.permCache.getAccessibleRecords(userId, 'bi_payment_programs', code);
      if (ids.includes(programId)) allowed.add(wsType as MaToolWorkstepType);
    }
    if (!isOwner && allowed.size === 0) throw new ForbiddenException('No permission');
    return allowed;
  }

  // Gate khi client gửi workstepType cụ thể
  async assertWorkstep(userId, programId, workstepType): Promise<void> {
    const allowed = await this.resolveAllowedWorksteps(userId, programId);
    if (!allowed.has(workstepType)) throw new ForbiddenException('No permission for workstep');
  }
}
```

## Áp dụng list-doc (pilot)

Controller (`bi-payment-document.controller.ts:33`):
- Bỏ `@RequireDataAccess(TABLE)` (DataAccessInterceptor early-return, `req.info.dataScope` undefined → service không dùng dataScope path cũ).
- Giữ `@RequirePermission(5 codes)`.
- DTO thêm `workstepType?: MaToolWorkstepType`.

Service `list()`:
```ts
async list(programId, query, userId) {
  if (!programId) throw new BadRequestException('programId required');
  const allowed = await this.stepScope.resolveAllowedWorksteps(userId, programId);
  const qb = this.docRepo.createQueryBuilder('d')
    .leftJoin('d.template', 't');
  if (query.workstepType) {
    if (!allowed.has(query.workstepType)) throw new ForbiddenException('No permission for workstep');
    qb.andWhere('t.workstep_type = :wt', { wt: query.workstepType });
  } else {
    qb.andWhere('t.workstep_type IN (:...allowed)', { allowed: [...allowed] });
  }
  // + filters hiện có (programId, pagination, search...)
  return qb.getMany();
}
```

## Mapping 5 code → behavior

| Code | workstep_type mapped | List-doc behavior |
|---|---|---|
| `bp_program_preparing` | `prepare`, `ex_prepare` | thấy doc workstep prepare/ex_prepare |
| `bp_program_reconciliation_sale` | `recon_data` | thấy doc recon_data |
| `bp_program_reconciliation_bicc` | `recon_feedback` | thấy doc recon_feedback |
| `bp_program_calculating` | (no workstep_type) | pass verb gate, nhưng `allowed` rỗng cho workstep → list trả empty (hoặc skip nếu user có code khác) |
| `bp_program_confirm_release` | (no workstep_type) | tương tự calculating |

**Lưu ý calculating/confirm_release**: không map workstep → user chỉ có 2 code này sẽ thấy list-doc empty. Đúng logic (doc không có workstep tương ứng). Nếu cần cho thấy doc release-phase, phải thêm workstep_type hoặc dùng `program.workstep_current` — quyết định defer (xem Unresolved).

## Mở rộng cho toàn bộ content-of-a-program (design bao phủ)

Pattern chung cho endpoint có programId:
1. **Single-step endpoint** (checklist, other-file, comment, step-PATCH): dùng `assertWorkstep(userId, programId, mappedWorkstep)` hoặc `assertCode(userId, programId, code)` (code không map workstep như calculating/confirm_release/next_step/view/edit/delete/create → check code at program trực tiếp).
2. **Multi-step list endpoint** (list-doc, list-comment, list-template): dùng `resolveAllowedWorksteps` + filter IN (hoặc gate khi client gửi workstepType).

Helper chung:
- `assertCodeAtProgram(userId, programId, code)`: SO own-all bypass; else `getAccessibleRecords(userId, table, code).includes(programId)`.
- `resolveAllowedWorksteps(userId, programId)`: như pseudocode.
- `resolveAllowedCodes(userId, programId, codes[])`: tổng quát — trả subset code user có tại program (SO own-all = all).

Endpoint refactor: thay `@RequireDataAccess(TABLE, code)` (interceptor path) bằng service call `stepScope.assertCodeAtProgram(...)` để được per-program enforcement. **Chỉ làm khi rollout đến endpoint đó**, pilot chỉ list-doc.

# Ưu/nhược

**Pros**
- Reuse 100% plumbing (`getAccessibleRecords(code)`, cache, SO own-all) — không thêm table, không thêm migration.
- KISS: 1 service mới + sửa pilot endpoint. Không đụng guard/interceptor core.
- DRY: `StepScopeService` dùng chung cho mọi content endpoint khi mở rộng.
- Đúng spec: code X chỉ hiệu lực tại program được gán; workstep filter theo code.

**Cons / risk**
- **2 nguồn真相** (verb gate code-only + service per-program): verb gate vẫn pass nếu user có code ở program khác → service phải là enforcement duy nhất. Quan trọng: không quên bỏ `@RequireDataAccess` cũ để tránh `dataScope` path override. Test kỹ pilot.
- **calculating/confirm_release** không có workstep_type → list empty cho user chỉ có 2 code này. Có thể không phải behavior mong muốn (xem Unresolved).
- **Performance**: `resolveAllowedWorksteps` gọi `getAccessibleRecords` 3-4 lần (3 distinct code vì prepare+ex_prepare chung code). Cache TTL 120s hấp hẫu. OK cho list. Có thể optimize: 1 query lấy tất cả code-user-at-program thay vì N query (defer).
- **Backward-compat**: DTO thêm optional `workstepType` — không phá client cũ. Bỏ `@RequireDataAccess` = behavior thay đổi (trước lọc theo dataScope row, sau lọc theo workstep+program) — cần thông báo client + test.
- **SO own-all semantics**: SO owner bicc dept thấy mọi workstep mọi program trong dept. Đúng spec user chốt. Nếu sau này muốn SO cũng per-workstep → phải thêm data_access rule cho SO (thay đổi lớn).

# Success criteria

- User có code X tại program A, KHÔNG có tại program B → gọi list-doc programId=B → 403 (program ngoài scope) HOẶC empty list (nếu program B thuộc dataScope nhưng user không có code nào tại B). Verify: KHÔNG trả doc program B.
- User có `bp_program_preparing` tại program A → list-doc programId=A (không gửi workstepType) → chỉ doc workstep prepare/ex_prepare.
- User gửi `workstepType=recon_data` nhưng chỉ có `bp_program_preparing` tại A → 403.
- SO owner bicc dept → list-doc mọi program trong dept, mọi workstep.
- Thiếu programId → 400.
- Cache hit: 5 code distinct key, không collision. Invalidation khi assign/revoke rule → TTL hoặc manual `invalidateUser`.

# Touchpoints (pilot)

| File | Change |
|---|---|
| `src/modules/bi-payment/common/step-scope.service.ts` | **NEW** — StepScopeService + WORKSTEP_TO_CODE map (move từ document.service.ts) |
| `src/modules/bi-payment/document/bi-payment-document.controller.ts:33` | bỏ `@RequireDataAccess`, thêm `workstepType` vào DTO, truyền `userId` xuống service |
| `src/modules/bi-payment/document/dto/search-bi-payment-document.dto.ts` | thêm optional `workstepType: MaToolWorkstepType` |
| `src/modules/bi-payment/document/bi-payment-document.service.ts:19-67` | rewrite `list()` dùng StepScopeService; remove/keep `WORKSTEP_TYPE_PERM` (move sang step-scope.service) |
| `src/modules/bi-payment/document/__tests__/` | **NEW** spec: per-program + per-workstep enforcement |

# Unresolved

1. **calculating/confirm_release list behavior**: user chỉ có 2 code này (không có preparing/recon) → list-doc empty chấp nhận được, hay cần cho thấy doc ở phase calculating/release? Nếu có → cần thêm workstep_type vào template HOẶC map theo `program.workstep_current`. **Hỏi user khi cook.**
2. **Optimize N-query**: `resolveAllowedWorksteps` gọi `getAccessibleRecords` per-code. Có thể gộp 1 query distinct code-user-at-program. Defer đến khi pilot xong + đo perf.
3. **List-comment / list-template endpoint**: cùng pattern multi-step? Comment map 3 code (preparing, recon_bicc, recon_sale) — có workstep concept không, hay chỉ program-scoped? Template list có programId? Cần scout thêm khi rollout đến endpoint đó.
4. **Step-PATCH endpoints** (preparing/calculating/reconciliation/workstep): đơn step, code map 1:1 → dùng `assertCodeAtProgram`. Nhưng `updateCalculatingWorkstep` dùng code `bp_program_calculating` (không map workstep_type) → chỉ check code at program, OK. Verify khi rollout.
5. **Verb gate vs service enforcement split**: có nên thu `@RequirePermission` về đúng code-set của endpoint (3 doc-codes cho list-doc) để verb gate cũng chính xác hơn? User chốt giữ 5 codes → defer, nhưng note: nếu sau này có code mới "xuyên" vào list-doc, verb gate sẽ pass → service phải là rào chặn cuối. Test service kỹ.
6. **programId resolution cho endpoint gián tiếp** (other-file upload qua `checkListId`): service phải resolve checklistId → programId trước khi check. Xác nhận logic khi rollout.
