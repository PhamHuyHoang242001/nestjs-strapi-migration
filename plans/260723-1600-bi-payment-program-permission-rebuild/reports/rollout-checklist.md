# Rollout Checklist

**Plan:** `plans/260723-1600-bi-payment-program-permission-rebuild/`  
**Date:** 2026-07-23  
**Status:** draft

## Preconditions

- Confirm the target DB physical table names with `to_regclass`.
- Do not guess the join table name.
- Keep legacy permissions in place until the manual re-grant step is complete.
- Flush Redis cache after any permission-table change.

### Preflight SQL

```sql
SELECT
  to_regclass('public.permissions')        AS permissions_table,
  to_regclass('public.permission')         AS permission_table,
  to_regclass('public.role_permissions')    AS role_permissions_table,
  to_regclass('public.roles_permissions')   AS roles_permissions_table,
  to_regclass('public.data_access_users')   AS data_access_users_table;
```

## Safe Deploy Order

| Step | Action | Notes |
| --- | --- | --- |
| 1 | Preflight live schema | Resolve the actual physical table names first. |
| 2 | Deploy code + add migration | Add `src/migration/1784797200000-add-bi-payment-program-permissions.ts`. |
| 3 | Manual re-grant | Grant the new codes while legacy codes still exist. |
| 4 | Flush Redis | Clear `perm:user:*` after grants. |
| 5 | Smoke test | Check matrix against the real DB. |
| 6 | Later cleanup release | Activate `src/deferred-migrations/1784804400000-remove-legacy-bi-payment-program-permissions.ts`. |
| 7 | Remove legacy grants/definitions | Only after the cleanup migration is active. |
| 8 | Flush Redis again | Required after cleanup. |
| 9 | Smoke test again | Confirm no stale access remains. |

## Manual Grant Template

Use the verified physical table names from preflight. Replace the placeholders before running.

```sql
-- Choose exactly one verified permission table and one verified join table.
-- Do not run this with guessed table names.
WITH selected_permissions AS (
  SELECT id, code
  FROM {{permission_table}}
  WHERE code IN (
    'bp_program_upload',
    'bp_program_upload_recon',
    'bp_program_approve',
    'bp_program_confirm'
  )
)
INSERT INTO {{role_permission_table}} (role_id, permission_id)
SELECT :role_id, id
FROM selected_permissions
ON CONFLICT DO NOTHING;
```

If direct user exceptions are used, apply the same verified-table choice to `data_access_users` before the cache flush.

## Rollback

### Before cleanup release

1. Revert the active add migration.
2. Flush `perm:user:*` again.
3. Keep legacy permissions intact.

### After cleanup release

1. Revert the deferred cleanup migration.
2. Re-grant legacy role/user assignments manually; the down migration restores definitions only.
3. Flush `perm:user:*` again.

## Smoke Matrix

| Check | Expected |
| --- | --- |
| View-only list / stats | `200` with empty data when no content capability is present. |
| Full upload | Sees all four worksteps. |
| Recon upload | Own-only `RECON_DATA` docs. |
| Approve | Only `PREPARE` / `EX_PREPARE` submit transitions and checklist approval. |
| Confirm | Only `pic-confirm-final-link`. |

## Unresolved Questions

- Which of `role_permissions` or `roles_permissions` is present in the target environment.
- Whether direct user exceptions need manual rows or role-only grants are sufficient for the target rollout.
