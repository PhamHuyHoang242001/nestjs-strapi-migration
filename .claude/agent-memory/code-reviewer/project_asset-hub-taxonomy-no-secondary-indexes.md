---
name: asset-hub-taxonomy-no-secondary-indexes
description: Asset-hub taxonomy tables are PK-only; do not re-add @Index or CREATE INDEX
metadata:
  type: project
---

Asset-hub taxonomy tables (`ai_hub_tags`, `ai_hub_publishers`, `skill_version_tags`, `prompt_version_tags`, `skill_package_responsibles`, `prompt_package_responsibles`) keep only serial PK indexes. User asked 2026-08-20 to clear secondary indexes added by uncommitted plan 260819-1542.

**Why:** explicit product/schema preference, not a performance decision. `@Index` on the 5 new entities + `CREATE INDEX` in 2608191600 were stripped; 2608200900 drops leftover named btrees on already-applied DBs.

**How to apply:** do not re-add `@Index` / `CREATE INDEX` on those tables in entities, migrations, or seeders. Unique/auth indexes in other modules (`2605050944`, PIC/supporter, `skill_version_files`) stay. PK indexes stay.
