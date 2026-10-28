---
phase: 2
title: TypeORM entities and enums
status: completed
priority: P1
effort: 2h
dependencies:
  - 1
---

<!-- Updated: Validation Session 1 - no options entity, enums for technical lists, join entities extend BaseColumn -->
<!-- Updated: Validation Session 2 - data_hub_ names, no user relations, per-field people link tables -->

# Phase 2: TypeORM entities and enums

## Overview
One entity per table under `src/modules/databases/` (repo convention) plus one enums file. Entities must mirror Phase 1 exactly (`DB_SYNCHRONIZE=false`).

## Requirements
- **Base classes:**
  - 12 entity tables extend `BaseSoftDeleteEntity`.
  - The 4 link tables extend `BaseColumn` (no soft delete), verified at `src/configuration/base-entity/base-column.entity.ts`.
- **Spec entities:** inherited `id`, `@Column() data_service_id`, and `@OneToOne(() => DataHubDataService) @JoinColumn({ name: 'data_service_id' })`.
- **Physical → logical:** `@ManyToOne`, nullable. All other module FKs are plain int columns (repo style).
- **User ids:** plain `@Column({ type: 'int' })`. No `@ManyToOne(() => User)` and no relation decorators.
- **Enum columns:** `@Column({ type: 'varchar', length: n })`, typed by the TS enum. Not the PG `enum` type, because the DB uses CHECK.
- **JSONB typing:** `changes: DataHubServiceChange[] | null`, `snapshot: Record<string, unknown>`.
- **Class names:** `DataHub*`, e.g. `DataHubDataService`, `DataHubDataServiceApiSpec`.

## Related Code Files
- Create `src/modules/databases/data-hub-enums.ts`:
  - module enums: `DataHubServiceType`, `DataHubStatus`, `DataHubConsumerCategory`, `DataHubHistoryAction`
  - 12 technical enums: `DataHubApiMethod`, `DataHubApiBaseUrl`, `DataHubApiAuthType`, `DataHubApiTokenAuthMethod`, `DataHubApiUpdateFrequency`, `DataHubApiSyncMode`, `DataHubSftpAuthType`, `DataHubSftpKeyVaultMethod`, `DataHubSftpFileFormat`, `DataHubSftpExportFrequency`, `DataHubSftpEncryption`, `DataHubSftpFlowDirection`
  - `DATA_HUB_API_BASE_URL_HOSTS` map (code → host)
  - `DataHubServiceChange` type `{ section, field, label_vi, label_en, old, new }`
  - If the file grows past 200 lines, split into `data-hub-enums.ts` (module) and `data-hub-technical-enums.ts`.
- Create 16 entity files in `src/modules/databases/`:
  - Org: `data-hub-division.entity.ts`, `data-hub-department.entity.ts`, `data-hub-request-unit.entity.ts`
  - Consumers: `data-hub-consumer.entity.ts`, `data-hub-consumer-history.entity.ts`
  - Dictionary: `data-hub-logical-term.entity.ts`, `data-hub-physical-term.entity.ts`, `data-hub-logical-term-history.entity.ts`
  - Data services: `data-hub-data-service.entity.ts`, `data-hub-data-service-api-spec.entity.ts`, `data-hub-data-service-sftp-spec.entity.ts`, `data-hub-data-service-history.entity.ts`
  - Link tables: `data-hub-data-service-requester.entity.ts`, `data-hub-data-service-it-supporter.entity.ts`, `data-hub-data-service-consumer.entity.ts`, `data-hub-data-service-physical-term.entity.ts`

## Implementation Steps
1. Write the enums file first. Its values must equal the Phase 1 CHECK lists exactly.
2. Write the entities, one per file, using `@Entity('data_hub_…')`.
3. Run `npx tsc --noEmit`.

## Success Criteria
- [x] tsc clean
- [x] The entity glob `src/**/*.entity.ts` picks the new files up (`src/configuration/orm.config.ts:14`)
- [x] DataSource metadata builds without error

## Risk Assessment
- **Entity/migration drift** (no synchronize): Phase 3 compares `information_schema.columns` against entity metadata.
- **Enum drift** between TS enums and DB CHECKs: the Phase 3 probe inserts every TS enum value.
