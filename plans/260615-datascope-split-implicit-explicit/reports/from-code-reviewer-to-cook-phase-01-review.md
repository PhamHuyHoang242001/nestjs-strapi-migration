# Phase 1 Code Review — DataScope Applier

**Reviewer:** code-reviewer
**Date:** 2026-06-15
**Files reviewed:**
- `src/common/authorization/types/data-scope.types.ts`
- `src/modules/data-access/helpers/data-scope-applier.ts`
- `src/modules/data-access/__tests__/data-scope-applier.spec.ts`
- `src/common/authorization/index.ts` (export addition)

## Verdict

**APPROVE with minor non-blocking notes.** Implementation matches plan spec; all branches traced correctly; tests cover all paths called out in phase-01 success criteria. No bugs found that affect Phase 4 consumers.

## Correctness — branch trace

| Branch | Plan spec | Code (file:line) | Result |
|---|---|---|---|
| `scope === null` | no-op | applier.ts:22 | OK |
| both empty | `1 = 0` | applier.ts:26-29 | OK |
| explicit only | `id = ANY(:dsExplicit_*)` | applier.ts:34-38 | OK |
| owned root === tableName | `id = ANY(:dsOwned_*)`, no JOIN | applier.ts:46-48 | OK |
| owned 1-hop | EXISTS, single FROM, correlation via FK | applier.ts:108-120 | OK — verified for `bi_hub_diagnostic_reports` → `bi_hub_bicc_departments`: emits `FROM bi_hub_bicc_departments __ds_t1 WHERE __ds_t1.id = r.bicc_department_id AND __ds_t1.id = ANY(:dsOwned)` |
| owned 2-hop | EXISTS, FROM + INNER JOIN | applier.ts:108-120 | OK — verified for `ma_tool_documents` → `ma_tool_workspaces`: `FROM ma_tool_templates t1 INNER JOIN ma_tool_workspaces t2 ON t2.id = t1.workspace_id … WHERE t1.id = r.template_id AND t2.id = ANY(:dsOwned)`. Correlation predicate ties t1 to outer `r` via `chain[0].fkColumn` (`template_id`), terminal alias filters by rootIds. Correct. |
| both | `(explicit OR owned)` | applier.ts:62 | OK |
| denies | `AND id <> ALL(:dsDeny_*)` as separate andWhere | applier.ts:64-68 | OK |
| `walkUp` returns null (unknown table) | drop owner branch | applier.ts:52-54 | OK, tested at spec.ts:165-178 |

EXISTS correlation predicate (applier.ts:118) is sound — `aliases[0].id = ${rootAlias}."${chain[0].fkColumn}"` correctly ties the subquery's first hop (parent table) back to the outer row's FK column. PG planner will rewrite this to a semi-join on the FK index.

## Security

### SQL injection — LOW RISK

`rootAlias`, `tableName`, and `rootTable` are interpolated unquoted into SQL strings (applier.ts:37, 48, 110, 113, 118, 120). A hostile value like `r"; DROP TABLE x; --` WOULD break the boundary.

**Mitigation:** Phase 4 callers are services with literal hardcoded strings; Phase 3 interceptor sources `rootTable` from `ROOT_OWNER_CONFIG` (server-side constant) and `tableName` from controller-declared metadata, not request body. Trust boundary is the resolver pipeline, not this helper.

**Recommendation (non-blocking):** Add a defensive regex guard at function entry, mirroring `getNameColumn()` at `hierarchy-config.ts:89`:
```ts
const IDENT_RE = /^[a-z_][a-z0-9_]*$/i;
if (!IDENT_RE.test(rootAlias) || !IDENT_RE.test(tableName)) {
  throw new Error('applyDataScope: invalid identifier');
}
if (scope.ownedRoots && !IDENT_RE.test(scope.ownedRoots.rootTable)) {
  throw new Error('applyDataScope: invalid rootTable');
}
```
Cheap defense-in-depth; catches a future refactor where someone wires user input into `tableName`. Not required for Phase 1.

### `Math.random()` suffix — ACCEPTABLE

8-char base36 = ~41 bits. Birthday collision probability across two calls in same request ≈ 1 in 2^20. With ~10 helper calls per request, P(collision) ≈ 5×10⁻⁵. If a collision occurred, `setParameter` would overwrite the earlier param with the later value — both calls' SQL would reference the same param name but with **only the second call's values**. This is a **silent correctness bug**, not a security issue.

**Recommendation (non-blocking):** Use a module-scoped monotonic counter instead — zero collision risk, simpler, deterministic in tests:
```ts
let __dsCounter = 0;
function nextSuffix(): string { return (++__dsCounter).toString(36).padStart(8, '0'); }
```
Plan-acceptable as-is; flag for follow-up if Phase 4 reveals nested helper calls.

### `padEnd(8, '0')` at applier.ts:130

Defensive padding for edge case where `Math.random()` returns `0.x` with fewer than 8 base36 digits after the decimal. Correct.

## Style / maintainability

1. **Spec file location mismatch:** Plan specifies `src/modules/data-access/helpers/__tests__/data-scope-applier.spec.ts` (line 46). Implementation placed at `src/modules/data-access/__tests__/data-scope-applier.spec.ts`. Trivial; jest config likely picks up both. Either accept or move to match plan.

2. **`walkUp` defensive bound:** 10-hop guard (applier.ts:92) is adequate given current max depth = 3. The plan's risk table flags this; aligned.

3. **No validation that `rootTable` is actually a root:** Helper trusts caller. If interceptor ever passes a non-root `rootTable`, `walkUp` will either reach a different root and return `null` (silent drop of owner branch — false-negative access) or, if `rootTable` happens to match an intermediate, return an incorrect chain. Phase 3 must guarantee `rootTable` came from `ROOT_OWNER_CONFIG` keys. **Recommend adding an assertion in Phase 3 interceptor**, not here.

4. **`[...scope.explicit]` clones (applier.ts:36, 45, 66):** Good — prevents TypeORM from holding a reference to caller's array. Documented "does not mutate scope" contract is held.

5. **Style consistency with `owner-scope-helpers.ts`:** The legacy helper uses raw JOIN chains and string interpolation of identifiers in the same way; new helper is stylistically consistent. No issue.

6. **Pure function:** Confirmed — no `this`, no module state, no `await`, no DB calls. Helper is synchronous and side-effect-free outside `qb` mutation.

## Acceptance criteria — phase-01-types-and-helper.md

| Criterion | Status |
|---|---|
| `DataScope` type exports correctly | OK (index.ts re-exports) |
| 10+ unit tests pass, 100% branch coverage on helper | OK (12 tests; every branch in applier.ts:22-68 + walkUp early returns covered) |
| Helper file ≤ 200 lines | OK (131) |
| No TS / lint errors | OK (per cook report) |
| Helper pure | OK |

## Recommended actions

1. **None blocking** for Phase 1 sign-off.
2. **Carry into Phase 3 prep:** interceptor MUST source `rootTable` from `ROOT_OWNER_CONFIG`, not request input. Add assertion at interceptor boundary.
3. **Optional follow-up:** swap `Math.random()` → monotonic counter to eliminate collision-overwrite risk before Phase 4 introduces nested calls.
4. **Optional follow-up:** identifier regex guard at applier entry for defense-in-depth.

## Unresolved questions

- Should helper validate `rootTable ∈ Object.keys(ROOT_OWNER_CONFIG)` defensively? My take: no — keep helper dumb, validate at interceptor. Confirm with planner.
- Spec file location: plan says `helpers/__tests__/`, code at `data-access/__tests__/`. Acceptable drift or move?

---

**Status:** DONE
**Summary:** Phase 1 helper correctly implements all spec branches; 12 tests cover the surface; non-blocking suggestions on `Math.random()` collision risk and SQL-identifier defense-in-depth.
**Concerns/Blockers:** None blocking. Two optional hardening suggestions for follow-up.
