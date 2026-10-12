# Fix: supporter đọc My Version

Date: 2026-10-12

`GET listVersions` + `versionDetail` (và `getDiff` cùng predicate) chỉ mở submitter/`created_by`/approver. Supporter bump được nhưng 403 / list trống.

Root: own-scope SQL và `canAccess` không join `ai_hub_supporters`. Helper `ownVersionScopeSql` + `canAccessAiHubVersion`; 4 WS. Soft-delete filter khớp reader. Approver vẫn không see-all trên list.

Verify: helper+query 232; upload blast-radius 139. Reviewer PASS.

`getDiff` cùng predicate `canAccessAiHubVersion`. `editVersion` rejected đã `assertCanBump` (supporter+upload); khóa bằng spec 4 WS. Pending vẫn SO-only.

## Unresolved

- Dashboard `latest-artifacts` `my_versions` vẫn `submitted_by OR created_by` — supporter có thể lệch count vs My Version.
- `listVersions` `isUpdate` = upload ∧ newest-rejected, không fold `canBump` identity (supporter+upload thấy true vì đã vào list).
