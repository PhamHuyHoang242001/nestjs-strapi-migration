---
phase: 1
title: Schema migration and entities
status: completed
priority: P1
effort: ''
dependencies: []
---

# Phase 1: Schema migration and entities

## Overview
Migration `2610271000-create-data-hub-source-tables.ts`: create `data_hub_source_tables`; physical: rename `physical_column`→`code`, drop status/check/global unique, add `source_table_id`,`data_service_id` (NOT NULL, FK), unique live (source_table_id, ci(code)); drop version `source_table`; old physical rows + links removed (data not kept). Entities updated.

Contract and decisions: see plan.md.

## Success Criteria
- [ ] up/down/up clean on local DB
- [ ] tsc clean
