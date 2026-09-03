---
phase: 1
title: Migration owning_unit_name
status: completed
priority: P1
effort: 2h
dependencies: []
---

# Phase 1: Migration owning_unit_name

## Overview

Thêm cột `owning_unit_name varchar(500) NULL` trên `skill_packages`, `prompt_packages`, `api_catalog_packages`. Entity TypeORM khớp. Không rename `publisher_id`.

## Requirements

- Functional: 3 bảng có cột mới; down drop cột.
- Non-functional: additive; row cũ NULL.

## Related Code Files

- Create: `src/migration/260828HHMM-add-ai-hub-owning-unit-name.ts`
- Modify: `src/modules/databases/skill-package.entity.ts`, `prompt-package.entity.ts`, `api-catalog-package.entity.ts`
- Modify: `src/migration/__tests__/asset-hub-taxonomy-tables.spec.ts` hoặc spec migration mới nếu pattern tách

## Implementation Steps

1. Migration up: `ADD COLUMN IF NOT EXISTS owning_unit_name varchar(500) NULL` × 3 tables.
2. Down: `DROP COLUMN IF EXISTS`.
3. Entity: `@Column({ type: 'varchar', length: 500, nullable: true }) owning_unit_name: string | null`. Comment: JSON `owning_unit_name`; khối chủ quản vẫn `publisher_id`.

## Success Criteria

- [ ] Migration reversible
- [ ] Entity columns include `owning_unit_name`
