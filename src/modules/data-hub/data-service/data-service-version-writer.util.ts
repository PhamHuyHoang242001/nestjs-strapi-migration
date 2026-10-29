import { EntityManager } from 'typeorm';
import { DataHubServiceChange, DataHubServiceHistoryAction } from '@modules/databases/data-hub-enums';
import { API_SPEC_FIELDS, SFTP_SPEC_FIELDS, VersionSource } from './data-service-spec.types';

export interface InsertVersionInput {
  dataServiceId: number;
  versionNo: number;
  oldVersion: number | null;
  userId: number;
  changelogNote: string | null;
  source: VersionSource;
}

// JSON samples go in as text cast to jsonb so any JSON value (object, array, scalar) round-trips.
const specValue = (field: string, value: unknown): unknown => {
  if (value === undefined || value === null || value === '') return null;
  return field.startsWith('sample_') ? JSON.stringify(value) : value;
};

async function insertSpec(
  manager: EntityManager,
  table: string,
  fields: readonly string[],
  versionId: number,
  spec: Record<string, unknown>,
): Promise<void> {
  const columns = ['data_service_version_id', ...fields];
  const values = [versionId, ...fields.map((f) => specValue(f, spec[f] ?? null))];
  const placeholders = columns.map((c, i) => (c.startsWith('sample_') ? `$${i + 1}::jsonb` : `$${i + 1}`));
  await manager.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`, values);
}

// Bulk-link ids to a version; unique pairs are guaranteed by the caller deduplicating.
async function insertLinks(
  manager: EntityManager,
  table: string,
  column: string,
  versionId: number,
  ids: number[],
): Promise<void> {
  if (ids.length === 0) return;
  await manager.query(`INSERT INTO ${table} (data_service_version_id, ${column}) SELECT $1, UNNEST($2::int[])`, [
    versionId,
    Array.from(new Set(ids)),
  ]);
}

// Writes an approved version with its spec and links; returns the new version id.
export async function insertApprovedVersion(manager: EntityManager, input: InsertVersionInput): Promise<number> {
  const { source, userId } = input;
  const rows: Array<{ id: number }> = await manager.query(
    `INSERT INTO data_hub_data_service_versions
       (data_service_id, version_no, old_version, state, name, short_description, purpose, request_unit_id,
        division_id, department_id, usage_guide_html, changelog_note,
        submitted_by, reviewed_by, reviewed_at)
     VALUES ($1, $2, $3, 'approved', $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, NOW())
     RETURNING id`,
    [
      input.dataServiceId,
      input.versionNo,
      input.oldVersion,
      source.name,
      source.short_description,
      source.purpose ?? null,
      source.request_unit_id,
      source.division_id,
      source.department_id,
      source.usage_guide_html,
      input.changelogNote,
      userId,
    ],
  );
  const versionId = Number(rows[0].id);
  if (source.api_spec) {
    await insertSpec(manager, 'data_hub_data_service_version_api_specs', API_SPEC_FIELDS, versionId, source.api_spec);
  }
  if (source.sftp_spec) {
    await insertSpec(
      manager,
      'data_hub_data_service_version_sftp_specs',
      SFTP_SPEC_FIELDS,
      versionId,
      source.sftp_spec,
    );
  }
  await insertLinks(
    manager,
    'data_hub_data_service_version_requesters',
    'user_id',
    versionId,
    source.requester_user_ids,
  );
  await insertLinks(
    manager,
    'data_hub_data_service_version_it_supporters',
    'user_id',
    versionId,
    source.it_supporter_user_ids,
  );
  await insertLinks(
    manager,
    'data_hub_data_service_version_service_owners',
    'user_id',
    versionId,
    source.service_owner_user_ids,
  );
  await insertLinks(manager, 'data_hub_data_service_version_consumers', 'consumer_id', versionId, source.consumer_ids);
  await insertLinks(
    manager,
    'data_hub_data_service_version_physical_terms',
    'physical_term_id',
    versionId,
    source.physical_term_ids,
  );
  return versionId;
}

export interface InsertHistoryInput {
  dataServiceId: number;
  versionId: number | null;
  versionNo: number | null;
  action: DataHubServiceHistoryAction;
  changeNote: string | null;
  changes: DataHubServiceChange[];
  userId: number;
}

export async function insertServiceHistory(manager: EntityManager, input: InsertHistoryInput): Promise<void> {
  await manager.query(
    `INSERT INTO data_hub_data_service_histories
       (data_service_id, data_service_version_id, version_no, action, change_note, changes, changed_by)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      input.dataServiceId,
      input.versionId,
      input.versionNo,
      input.action,
      input.changeNote,
      JSON.stringify(input.changes),
      input.userId,
    ],
  );
}
