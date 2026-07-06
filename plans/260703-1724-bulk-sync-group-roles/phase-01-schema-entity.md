---
phase: 1
title: Schema & Entity
status: completed
priority: P1
effort: 2h
dependencies: []
---

# Phase 1: Schema & Entity

## Overview
Create the new source table `group_role_mappings` and its TypeORM entity. User seeds data; API reads all non-deleted rows.

## Requirements
- Functional: table with 3 string columns `type`, `group_role`, `email_user` + standard id/timestamps/soft-delete.
- Non-functional: follow existing entity + migration conventions; entity registered so `DataSource` can query it.

## Architecture
- Entity extends `BaseSoftDeleteEntity` (`src/configuration/base-entity/base-soft-delete.entity.ts`) → inherits `id` (int PK), `created_at`, `updated_at`, `deleted_at`, `is_deleted`.
- Table name explicit: `@Entity('group_role_mappings')`.
- Index on `group_role` (grouping key) helps the read; optional but cheap.
- Migration follows filename convention `YYMMDDHHMM-<slug>.ts` seen in `src/migration/` (e.g. `2606091000-create-resource-owners-table.ts`). Use domain slug only (no phase/finding refs).

## Related Code Files
- Create: `src/modules/databases/group-role-mapping.entity.ts`
- Create: `src/migration/2607031724-create-group-role-mappings-table.ts`
- Modify: (if a global entity barrel/registration exists) ensure entity auto-loaded. Check `src/configuration/orm.config.ts` entity glob — most entities auto-load via glob, so likely no edit needed. Verify.

## Implementation Steps
1. Create entity:
   ```ts
   import { BaseSoftDeleteEntity } from '@configuration/base-entity';
   import { Column, Entity, Index } from 'typeorm';

   @Entity('group_role_mappings')
   export class GroupRoleMapping extends BaseSoftDeleteEntity {
     @Column()
     public type: string;

     @Index()
     @Column()
     public group_role: string;

     @Column()
     public email_user: string;
   }
   ```
2. Confirm entity registration path: open `src/configuration/orm.config.ts` and check `entities` glob (e.g. `**/*.entity.ts`). If glob-based → no change. If explicit array → add `GroupRoleMapping`.
3. Create migration with `up` creating `group_role_mappings` (id serial PK, type varchar, group_role varchar, email_user varchar, created_at/updated_at timestamptz default now, deleted_at nullable, is_deleted boolean default false, index on group_role) and `down` dropping the table. Mirror column types/defaults used by a recent create-table migration for consistency.
4. Run `npm run build` to confirm the entity/migration compile.
5. (Optional, local) run `npm run typeorm:run` against a dev DB to verify migration applies + reverts cleanly.

## Success Criteria
- [ ] `GroupRoleMapping` entity compiles and is discoverable by `DataSource.getRepository(GroupRoleMapping)`.
- [ ] Migration creates the table with correct columns + soft-delete cols + index; `down` drops it.
- [ ] `npm run build` passes with no type errors.

## Risk Assessment
- Entity not auto-loaded → runtime "No metadata" error. Mitigation: verify orm.config entities glob in step 2 before proceeding.
- Migration column types drift from convention → mismatch with BaseSoftDeleteEntity expectations. Mitigation: copy types/defaults from a recent create-table migration.
