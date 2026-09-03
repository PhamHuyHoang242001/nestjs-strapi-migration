---
date: 2026-08-28
topic: ai-hub field rename brainstorm + plan
---

# Context

Product: cán bộ quản lý → tác giả; đơn vị chủ quản → khối chủ quản; thêm freetext trung tâm/phòng ban.

# Decision

Scope rút: chỉ thêm `owning_unit_name` (freetext, optional, varchar 500). `publisher_id` / `responsible_user_ids` / `responsible_users` giữ JSON cũ.

# Next

Plan `plans/260828-ai-hub-author-owning-fields/`. Cook sau khi FE sẵn hard-cut.
