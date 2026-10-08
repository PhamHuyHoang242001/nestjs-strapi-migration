---
date: 2026-10-06
topic: approver edit pending skill/prompt/api-catalog versions
---

# Context

PUT `versions/:vid` only allowed submitter/creator + `*_upload` on the latest rejected version. Approvers could not correct a pending record before approve/reject.

# Decision

Second `editVersion` branch: `*_approve` + `state=pending`. Same full body as bump; locked fields are ignored (stored values kept). Arrays: skill `['file']`, api-catalog `['mock_req','mock_res']`, prompt `[]`.

# Next

FE: same update body; skill still send `file` (ignored for approver); api-catalog may send mocks (not persisted).
