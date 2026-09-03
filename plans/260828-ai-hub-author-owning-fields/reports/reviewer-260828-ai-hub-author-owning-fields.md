## Code Review Summary

### Scope
- Files: asset-hub DTO/meta, skill/prompt/api-catalog upload+query, list query DTOs, owning_unit_name migration, tests
- Focus: JSON rename owning_block / authors / owning_unit_name (intentional breaking)
- Scout: write paths, list filter, GET publishers, leftover old JSON keys, spread of TypeORM pkg

### Overall Assessment
Rename on write DTOs, list query, and decorated read keys is complete and consistent across 3 workspaces. DB `publisher_id` + responsible tables kept. Bump omit/`""` for `owning_unit_name` matches contract. One incomplete cut: list + package-detail still serialize entity `publisher_id` via `...pkg`.

### Critical Issues
None (authz, data loss, wrong persist mapping not found).

### High Priority
**List/detail JSON still expose `publisher_id`.** Phase-03 success: "Key cũ không còn trên response". Version-detail `package` object is explicit and omits it; list + package GET use `{ ...pkg, owning_block, authors, owning_unit_name }` so TypeORM `publisher_id` remains a public key. Same in skill, prompt, api-catalog.

Fix: omit when shaping, e.g. destructure:

```ts
const { publisher_id: _pid, ...rest } = pkg;
return { ...rest, owning_block, authors, owning_unit_name: pkg.owning_unit_name ?? null, ... };
```

Add `expect(row).not.toHaveProperty('publisher_id')` and `not.toHaveProperty('publisher')` / `responsible_users` on list+detail specs.

### Medium Priority
None blocking. Error code `INVALID_PUBLISHER` is internal, not a JSON field.

### Low Priority
`GET /v1/asset-hub/publishers` URL unchanged (intentional). Internal names `MAX_RESPONSIBLE_*`, PIC tables, `meta.responsibles` are DB/internal — OK.

### Edge Cases Found by Scout
- Bump omit `owning_unit_name`: `packageOwningFields(..., 'bump')` returns `{ publisher_id }` only — verified helper + tests.
- Create omit unit name → null.
- `""` / whitespace → null.
- List `owning_block_id` → `pkg.publisher_id = :publisher_id`.
- Write services use `dto.owning_block_id` / `dto.author_ids` only (no leftover `dto.publisher_id` / `dto.responsible_user_ids`).
- Shared `AssetHubItemMetaFieldsDto`; forbidNonWhitelisted on 3 workspace controllers → old write keys 400.
- Filter `if (query.owning_block_id)` safe: DTO `@Min(1)`.

### Positive Observations
- Shared mapper `packageOwningFields` + one DTO base.
- Version-detail package payload already omits `publisher_id`.
- Migration varchar(500) on all 3 package tables.

### Recommended Actions
1. Strip `publisher_id` (and do not add `publisher` / `responsible_users`) on list + package-detail for all 3 workspaces.
2. Assert absence in query specs.

### Metrics
- Type Coverage: n/a (review only)
- Test Coverage: n/a
- Linting Issues: n/a

### Unresolved Questions
None.

### Acceptance vs contract
| Item | Status |
| Write owning_block_id, author_ids, optional owning_unit_name | Met |
| Read owning_block, authors, owning_unit_name | Met (plus leftover publisher_id on list/detail) |
| List owning_block_id → SQL pkg.publisher_id | Met |
| DB publisher_id + responsible tables | Met |
| 3 workspaces | Met |
| Bump omit keeps unit name; "" → null | Met |
| GET /v1/asset-hub/publishers | Met |
| No dto.publisher_id / responsible_user_ids on writes | Met |
