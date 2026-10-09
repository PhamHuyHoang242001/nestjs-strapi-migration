---
date: 2026-10-09
topic: AI Hub coworker + supporters + per-WS SO
---

# Context

Cần workspace coworker (flow prompt) + siết quyền 4 WS. Không muốn SO ôm bump mọi package; approver không sửa pending.

# Decision

2 code/WS. Bump = creator ∨ supporter (+ upload). Pending = chỉ SO. Toggle = creator/supporter/SO. `ai_hub_supporters` chung. `supporter_ids` trên create/bump/editVersion, không PATCH. SO = 4 module con own-all. Coworker: mã immutable unique; channel/model seed GET; domain const Teams.

# Next

Plan `plans/261009-1424-ai-hub-coworker/` (`--tdd`, 6 phase). Cook sau validate/red-team nếu user chọn.
