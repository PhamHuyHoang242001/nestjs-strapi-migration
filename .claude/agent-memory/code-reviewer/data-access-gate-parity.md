---
name: data-access-gate-parity
description: enforceManageGate vs records-browser (getScopedRecords) parity gaps and verb-mismatch on delete/removeLink write paths
metadata:
  type: project
---

Plan 260728-1631-create-rule-visibility-gate extended `enforceManageGate` to gate all RULE_TARGET_TABLES. The verb-mismatch + roleIds-plumbing gaps below were FIXED in that change (as of 2026-07-28 unstaged diff). Kept as history + one residual latent finding.

**Fixed:** delete/removeLink now gate on DELETE_VERB (`perm_data_access_delete`); create/update on CREATE_VERB. `enforceManageGate` now takes `verbCode` param + does its own active-role lookup (`SELECT role_id FROM user_roles WHERE user_id=$1 AND deleted_at IS NULL`) for the own-all branch. 4 sites: create `:668`, update `:783`, delete `:901`, removeLink `:976`.

**Residual latent finding (LOW, not active today):** the own-all branch (`OWNER_ALL_TABLES.has(tableName)`) is mutually EXCLUSIVE with `filterManageableRecords` — it `return`s on `hasOwnerAllAssignment` else `throw`s, never falling through to the per-record editor path. Plan states OR-semantics (own-all ∨ filterManageableRecords ∨ super). Harmless NOW because `ma_tool_cstb_rpt_properties` (the only OWNER_ALL_TABLE) seeds ONLY `ma_tool_report_view` (read) — no `update` permission → resolveEditCode null → filterManageableRecords always []. If that table ever gets an update permission + creator flow, per-record editors would be silently 403'd.

**Parity note (out-of-scope per user):** gate uses `filterManageableRecords` (editable(edit-code) ∨ isInOwnedScope); browser non-manage owner-chain uses `getScopedRecords` (role-owned owner-chain only). Not equivalent by design — user did not require parity with records browser; authority model is the intended standard.
- resolveEditCode returns null when no `modules` row (action='update') exists → editable set empty → only super_admin/SO pass.
