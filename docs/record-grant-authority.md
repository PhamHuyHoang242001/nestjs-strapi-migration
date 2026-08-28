# Record-level Grant Authority (derive from edit + rule-verb)

The report creator automatically gains authority to **manage grants** (create/update/delete
`data_access` rules) on the report they created, and can **hand it over** to another user. No
new permission is introduced — the authority is derived from permissions the user already holds.

## Core rule

```
canManageRecord(user, record) =
    super_admin
    OR SO (OwnerScopeResolverService.isInOwnedScope)
    OR ( editOnRecord(user, record) AND user holds <rule-verb per API> )

editOnRecord = getAccessibleRecords(user, table, EDIT_CODE).includes(record)
EDIT_CODE     = the module's permission with action = 'update'
```

`CreatorAccessGrantService` already grants a new record's creator the RUD set
(`read`/`update`/`delete`) as a record-scoped `data_access` grant, so the creator holds the
edit permission on their record through the existing mechanism — nothing extra is granted.

## Per-API gate

| API | Gate |
|---|---|
| `POST /v1/data-access/create` `/create-bulk`, `PUT /update/:id`, `DELETE /delete/:id` `/remove-link/:ruleId` | `editOnRecord ∧ perm_data_access_create` (+ super_admin/SO) |
| `GET /v1/data-access/list` | `editOnRecord ∧ perm_data_access_view` (+ super_admin/SO) |
| `GET /v1/report-access/records/:table` | `editOnRecord ∧ perm_data_access_create` (+ super_admin/SO) |
| `POST /v1/data-access/handover` | caller manages every record (`canManageRecord`) OR super_admin/SO |

`perm_data_access_create` / `_view` are the admin-granted global verbs deciding **who** may act
on records they can edit. A user who only has edit (no verb) can change the report but cannot
manage its grants.

## Which tables opt in

Controlled by `MANAGE_ENABLED_MODULES` in
`src/modules/data-access/constants/hierarchy-config.ts` (keyed by `table_name`, must be a subset
of `RULE_TARGET_TABLES`). Tables outside this set keep the prior global-verb-only behavior
(backward compatible). Currently: `bi_hub_diagnostic_reports`, `bi_payment_programs`.

## Write-gate cache note

Write authorization reads ownership straight from the DB (`bypassCache`) so a user just granted
edit is not blocked by the 120s data-access cache. Read/list gates use the cached path. On
handover, cache is invalidated for both users and by table after commit.

## Handover

`handover` moves the creator-shaped RUD grant from user A to user B atomically (one
transaction, all-or-nothing across records). Third-party rules on the same records — including
rules A previously created for others — are left intact; only A's own record-scoped RUD grant
moves. Because manage authority is derived from the edit grant, moving edit moves the authority.

## Extending to another table/service (exemplar: descriptive `bi_hub_reports`)

The gate + handover are config-driven, so extending to a new table is mostly configuration:

1. **Add the table to `MANAGE_ENABLED_MODULES`** in `hierarchy-config.ts` (it is already a
   `RULE_TARGET_TABLES` member for `bi_hub_reports`).
2. **Ensure a create-flow exists that calls `CreatorAccessGrantService.grantCreatorAccess`** so
   each new record's creator receives the RUD edit grant (the derivation source). This requires
   the target to have a creator/owner column and a create service that records it.
3. **No core code changes** — the gate (`ManageAuthorityService.canManageRecord`), list/browser
   scoping, and handover already resolve the edit permission (`action='update'`) per module
   dynamically.

**Blocker for `bi_hub_reports` today (verify before enabling):**
`bi-hub-descriptive-report.entity.ts` has no creator column, and the repo has no create service
for descriptive reports (only read/join paths in `bicc-department.service.ts`). Until a
create-flow + creator column exist, descriptive is documented here as an exemplar only and is
**not** added to `MANAGE_ENABLED_MODULES` (avoids a half-wired gate).

## Deferred (not in this round)

- Backfill edit-grants for pre-existing diagnostic records by `created_by_admin_id` — do when
  going live against production data that predates creator-grant.
- Per-module feature-flag rollout — pairs with the backfill at go-live.
