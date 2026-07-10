---
title: "Bi-Payment Step-Scoped Permission (programId + workstep) — pilot list-doc"
description: "Enforce per-program + per-workstep permission on bi-payment list-doc. StepScopeService resolves allowed workstep_types for user at a program (SO owner = own-all via isInOwnedScope; role/user-exception = code effective only at programs with data_access rule). Keeps per-document DENY via applyDataScope. Pilot list-doc ONLY; other doc handlers deferred."
status: pending
priority: P1
branch: "main"
tags: [permission, data-access, bi-payment, step-scope]
blockedBy: []
blocks: []
created: "2026-07-08T08:56:15.908Z"
createdBy: "ck:plan"
source: skill
---

# Bi-Payment Step-Scoped Permission (programId + workstep) — pilot list-doc

## Overview

Verb gate (`PermissionGuard`) check code-only → code X hiệu lực mọi program, sai spec. Cần enforcement per-program + per-workstep ở service layer, pilot list-doc.

**Cơ chế** (sửa post red-team): `StepScopeService.resolveAllowedWorksteps(userId, programId)` trả tập `workstep_type` user được phép tại program:
- SO owner bicc dept → own-all (mọi workstep) **qua `ownerScope.isInOwnedScope(userId,'bi_payment_programs',programId)`** (helper đã có, walk program→project→bicc_dept, có soft-delete guard). Không roll custom query.
- Role thường / user-exception → reuse `WORKSTEP_TYPE_PERM` (4 workstep_type → code), check `programId ∈ getAccessibleRecords(userId,'bi_payment_programs',code)`.
- List filter `template.workstep_type IN (:allowed)` **+ GIỮ `applyDataScope(qb,'d',DOC_TABLE,scope)`** để per-document DENY rules còn tác dụng.

**Reuse 100%** plumbing (`getAccessibleRecords(code)`, `isInOwnedScope`, cache, SO own-all). Không migration, không table mới.

Source: `reports/brainstorm-summary.md` (full design), `reports/from-code-reviewer-to-planner-red-team-*.md` (3 red-team reports).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Implement StepScopeService (TDD)](./phase-01-implement-stepscopeservice-tdd.md) | Pending |
| 2 | [Wire list-doc (TDD)](./phase-02-wire-list-doc-tdd.md) | Pending |
| 3 | [Verify, provisioning & edge cases](./phase-03-verify-provisioning-edge-cases.md) | Pending |

(Phase "Research" gộp vào phase 1 step 1 — drift-check 15'. Xem Red Team Finding 12.)

## Dependencies

- No cross-plan blocking. Builds on shipped: SO owner-implied (datascope-option-b), PermissionGuard OR-semantics, soft-delete filter.
- **Operational dependency**: cần path tạo `data_access` rule scope program (module_id=13) cho non-SO user. Xem phase 3 + Key Decisions.

## Key Decisions (locked, post red-team)

- `programId` BẮT BUỘC trên list-doc → 400 nếu thiếu/invalid. DTO `@Transform(()=>Number)+@IsInt+@Min(1)` (giữ query string, coerce). **Rollout phased**: v1 optional (omit → step-scope all programs user có code), v2 required sau client migration.
- **Giữ field `workstep`** (không đổi tên `workstepType`). Tighten `@IsEnum(MaToolWorkstepType)`. Breaking nhẹ: invalid workstep value cũ → 400 thay vì ignore.
- SO owner = own-all **qua `isInOwnedScope`** (không custom query). Luôn apply workstep filter (SO = ALL_WORKSTEP_TYPES) để NULL `workstep_type` doc không lệch SO/non-SO.
- **GIỮ `applyDataScope(qb,'d',DOC_TABLE,scope)`** — per-document DENY rules phải còn tác dụng. Chỉ bỏ `assertProgramInScope` cũ (thay bằng StepScopeService).
- Workstep dual: client gửi `workstep` → gate (403 nếu ngoài allowed); không gửi → filter IN allowed-union.
- `@RequirePermission` list-doc giữ 5 codes (verb gate fast-fail). **Service = enforcement final TRÊN LIST PATH** — 14 handler document khác (download/details/delete/upload/...) vẫn verb-gate-only, deferred (phase 3 grep inventory).
- 403 vs empty-list: program ngoài scope (user có code nhưng programId ∉ tập được gán) → 403; user có code qua role nhưng CHƯA có rule nào → empty list 200 (không 403).
- `WORKSTEP_TYPE_PERM` → const riêng `step-scope.constants.ts` (`Object.freeze`), import bởi cả step-scope.service + document.service (re-export) + template service. Move bắt buộc, update import template (5 call sites).
- Approach: service-layer (không guard mới).

## Open (defer to cook)

1. `bp_program_calculating`/`confirm_release` không map workstep_type → user chỉ 2 code này → empty list. **Default = accept empty**, verify product trong phase 3.
2. Cache: `RoleService.update` perm-change không invalidate `owner_scope` (key `:owner_scope`) → 120s SO stale. Accepted risk cho pilot; follow-up: thêm `invalidateOwnerScopeByRole` vào perm-change path.
3. N-query optimize (gộp per-code) → defer sau pilot + đo perf (phase 3). Reuse pattern `getPermissions(userId)` 1-call như `BiPaymentTemplateService.resolveViewableWorksteps` nếu perf là vấn đề.

## Red Team Review

### Session — 2026-07-08
**Findings:** 12 (12 accepted, 0 rejected after dedup from 27 raw across 3 reviewers)
**Severity breakdown:** 4 Critical, 5 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `programUnderOwnedRoots` roll custom query; `bi_payment_programs` không có `bicc_department_id` (2 hops). Dùng `isInOwnedScope` | Critical | Accept | Phase 1 |
| 2 | DTO `workstep` field đã có; rename `workstepType` break client. Giữ `workstep`, `@IsEnum` | Critical | Accept | Phase 2 |
| 3 | Bỏ `applyDataScope` mất per-doc DENY. GIỮ `applyDataScope` | Critical | Accept | Phase 2 |
| 4 | Không path tạo data_access rule scope program (module_id=13) → non-SO 403. Seed/admin + fallback empty | Critical | Accept | Phase 3 |
| 5 | `programId` DTO string; `@IsNumber` 400 client. `@Transform+@IsInt+@Min(1)` + phased rollout | High | Accept | Phase 2 |
| 6 | `bi-payment-document.module.ts` không tồn tại. Register trong `bi-payment.module.ts` | High | Accept | Phase 2 |
| 7 | Pilot chỉ `list()`; 14 handler khác verb-gate-only. Clarify scope + grep inventory | High | Accept | Phase 3 |
| 8 | 403 vs empty-list ambiguity. User có code chưa gán program → empty, không 403 | High | Accept | Phase 1+2 |
| 9 | `WORKSTEP_TYPE_PERM` move bắt buộc + freeze const file + update template import | High | Accept | Phase 1 |
| 10 | SO skip workstep filter → NULL workstep_type doc lệch. Luôn apply (SO=ALL) | Medium | Accept | Phase 2 |
| 11 | Cache owner_scope không invalidate role perm-change. Accepted 120s, follow-up | Medium | Accept | Open #2 |
| 12 | Phase "Research" YAGNI padding. Gộp drift-check 15' vào phase 1 | Medium | Accept | Plan (phases collapsed) |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01..03 (post-rewrite).
- Decision deltas checked: 12 (phases collapsed 4→3, isInOwnedScope replaces custom query, applyDataScope retained, workstep field retained, DTO transform, module ref fixed, WORKSTEP_TYPE_PERM const file, SO always-filter, 403-vs-empty semantics).
- Reconciled stale references: removed `programUnderOwnedRoots`, removed `workstepType`, removed "drop applyDataScope", fixed module path, removed `@IsNumber` bare, removed `bi-payment-document.module.ts`, removed phase-01-research.md.
- Unresolved contradictions: 0 — plan cook-ready.
