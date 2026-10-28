/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
// One-off, idempotent dev seeder: org lists + Mock-EDA-Portal JSON (services, consumers, terms) into data_hub_*.
// Not a migration on purpose — this is test data for FE integration, never for production.
// Run: npx ts-node -r tsconfig-paths/register src/scripts/seed-data-hub-mock-data.ts <mock>/data-exchange/data
//        [--user-id 1] [--schema my_scratch_schema]
// Re-running skips everything that already exists (by code / mock id marker).
// Physical terms and source tables are seeded separately by seed-data-hub-source-tables.ts (they belong to a service).

import * as fs from 'fs';
import * as path from 'path';
import { DataSource, EntityManager } from 'typeorm';
import { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME } from '@configuration/env.config';
import { DataHubServiceType } from '@modules/databases/data-hub-enums';
import { buildServiceCode, reserveServiceId } from '@modules/data-hub/data-service/data-service-code.util';
import * as M from './seed-data-hub-mock-mappers';
import { backfillUsageGuides, buildUsageGuide } from './seed-data-hub-usage-guide';

type Row = Record<string, any>;
const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const dataDir = process.argv[2];
const fallbackUserId = Number(arg('user-id') ?? 1);
const schema = arg('schema');
const LIVE = 'deleted_at IS NULL AND COALESCE(is_deleted, false) = false';
const readJson = (file: string): Row[] => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));

async function upsertOrg(m: EntityManager, table: string, list: M.OrgSeed[], extra = false) {
  const ids = new Map<string, number>();
  for (const o of list) {
    const found: Row[] = await m.query(`SELECT id FROM ${table} WHERE code = $1 AND ${LIVE}`, [o.code]);
    const row: Row[] = found.length
      ? found
      : await m.query(
          `INSERT INTO ${table} (code, name${extra ? ', category' : ''}) VALUES ($1, $2${extra ? ', NULL' : ''}) RETURNING id`,
          [o.code, o.name],
        );
    ids.set(o.code, Number(row[0].id));
  }
  return ids;
}

async function seed(m: EntityManager, w: M.MapWarnings) {
  const stats = { consumers: 0, logical: 0, services: 0, skipped: 0, guides_backfilled: 0 };
  const divisions = await upsertOrg(m, 'data_hub_divisions', M.DIVISIONS);
  const departments = await upsertOrg(m, 'data_hub_departments', M.DEPARTMENTS);
  const requestUnits = await upsertOrg(m, 'data_hub_request_units', M.REQUEST_UNITS, true);

  // Mock people are usernames; match them to users by email prefix, else the runner's user id.
  const users: Row[] = await m.query(`SELECT id, email FROM users WHERE email IS NOT NULL AND ${LIVE}`);
  const byPrefix = new Map(users.map((u) => [String(u.email).split('@')[0].toLowerCase(), Number(u.id)]));
  const userId = (username?: string) => {
    const id = username ? byPrefix.get(username.toLowerCase()) : undefined;
    if (id === undefined) w.add('user→fallback');
    return id ?? fallbackUserId;
  };

  const consumerIds = new Map<string, number>();
  for (const s of readJson('subscribers.json')) {
    const code = String(s.subscriber_code).toUpperCase();
    const found: Row[] = await m.query(`SELECT id FROM data_hub_consumers WHERE code = $1 AND ${LIVE}`, [code]);
    if (found.length) {
      consumerIds.set(code, Number(found[0].id));
      continue;
    }
    const so = userId(s.owner_username);
    const snapshot = {
      code,
      name: M.truncate(s.subscriber_name, 255),
      category: s.category === 'PARTNER_ECOSYSTEM' ? 'PARTNER_ECOSYSTEM' : 'INTERNAL_APP',
      division_id: divisions.get(M.consumerDivisionCode(String(s.business_unit ?? ''))),
      short_description: M.truncate(s.short_description ?? s.description, 1000),
      avatar_url: null,
      status: 'active',
      so_app_user_ids: [so],
    };
    const [row]: Row[] = await m.query(
      `INSERT INTO data_hub_consumers (code, name, category, division_id, short_description,
         created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [code, snapshot.name, snapshot.category, snapshot.division_id, snapshot.short_description, so],
    );
    await m.query(`INSERT INTO data_hub_consumer_so_apps (consumer_id, user_id) VALUES ($1, $2)`, [row.id, so]);
    await m.query(
      `INSERT INTO data_hub_consumer_histories (consumer_id, version_no, action, snapshot, changed_by)
       VALUES ($1, 1, 'CREATE', $2, $3)`,
      [row.id, JSON.stringify(snapshot), so],
    );
    consumerIds.set(code, Number(row.id));
    stats.consumers++;
  }

  // Logical terms: the dictionary master plus any term_code referenced only by services.
  const services = readJson('data-services.json');
  const logicalSeeds = new Map<string, { description: string }>();
  for (const t of readJson('data-terms.json')) {
    logicalSeeds.set(t.logical_term_code, { description: t.short_description });
  }
  for (const s of services) {
    for (const mt of s.mapped_terms ?? []) {
      if (!logicalSeeds.has(mt.term_code)) {
        logicalSeeds.set(mt.term_code, { description: mt.logical_term });
      }
    }
  }

  const logicalIds = new Map<string, number>();
  const newLogical = new Set<number>();
  for (const [code, l] of logicalSeeds) {
    const found: Row[] = await m.query(`SELECT id FROM data_hub_logical_terms WHERE code = $1 AND ${LIVE}`, [code]);
    const row: Row[] = found.length
      ? found
      : await m.query(
          `INSERT INTO data_hub_logical_terms (code, short_description, created_by) VALUES ($1, $2, $3) RETURNING id`,
          [code, M.truncate(l.description, 1000), fallbackUserId],
        );
    if (!found.length) {
      newLogical.add(Number(row[0].id));
      stats.logical++;
    }
    logicalIds.set(code, Number(row[0].id));
  }

  for (const id of newLogical) {
    const [snap]: Row[] = await m.query(
      `SELECT l.code, l.short_description, l.example_value,
         '[]'::json AS physical_terms
       FROM data_hub_logical_terms l WHERE l.id = $1`,
      [id],
    );
    await m.query(
      `INSERT INTO data_hub_logical_term_histories (logical_term_id, version_no, action, snapshot, changed_by)
       VALUES ($1, 1, 'CREATE', $2, $3)`,
      [id, JSON.stringify(snap), fallbackUserId],
    );
  }

  for (const s of services) {
    const marker = `mock-import:${s.id}`;
    const exists: Row[] = await m.query(`SELECT 1 FROM data_hub_data_service_versions WHERE changelog_note = $1`, [
      marker,
    ]);
    if (exists.length) {
      stats.skipped++;
      continue;
    }
    await importService(m, s, marker, { divisions, departments, requestUnits, consumerIds, userId }, w);
    stats.services++;
  }
  // Services imported before the guide existed still have an empty one.
  stats.guides_backfilled = await backfillUsageGuides(m, services);
  return stats;
}

interface Refs {
  divisions: Map<string, number>;
  departments: Map<string, number>;
  requestUnits: Map<string, number>;
  consumerIds: Map<string, number>;
  userId: (username?: string) => number;
}

async function importService(m: EntityManager, s: Row, marker: string, r: Refs, w: M.MapWarnings) {
  const isApi = s.service_type === 'API';
  const divisionCode = s.owner_workspace_id === 'IT' ? 'IT' : 'EDA';
  const owner = r.userId(s.service_owner);
  const departmentCode = r.departments.has(s.business_unit)
    ? s.business_unit
    : (w.add(`department:${s.business_unit}`), 'EDA');
  const departmentId = r.departments.get(departmentCode);
  // Same rule as the API: [SERVICE]_<division>_<department>_<id>.
  const serviceType = isApi ? DataHubServiceType.API : DataHubServiceType.SFTP;
  const id = await reserveServiceId(m);
  const [pkg]: Row[] = await m.query(
    `INSERT INTO data_hub_data_services (id, service_code, service_type, status, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      id,
      buildServiceCode(serviceType, divisionCode, departmentCode, id),
      serviceType,
      M.serviceStatus(s.status),
      owner,
    ],
  );
  const [ver]: Row[] = await m.query(
    `INSERT INTO data_hub_data_service_versions (data_service_id, version_no, state, name, short_description,
       request_unit_id, division_id, department_id, usage_guide_html, changelog_note,
       submitted_by, reviewed_by, reviewed_at)
     VALUES ($1, 1, 'approved', $2, $3, $4, $5, $6, $7, $8, $9, $9, NOW()) RETURNING id`,
    [
      pkg.id,
      M.truncate(s.service_name, 255),
      M.truncate(s.use_case_description, 1000),
      r.requestUnits.get(M.requestUnitCode(s.workspace_code, w)),
      r.divisions.get(divisionCode),
      departmentId,
      buildUsageGuide(s),
      marker,
      owner,
    ],
  );
  if (isApi) {
    await m.query(
      `INSERT INTO data_hub_data_service_version_api_specs (data_service_version_id, method, base_url, endpoint_path,
         auth_type, update_frequency, sync_mode, timeout, sample_request, sample_response)
       VALUES ($1, $2, $3, $4, $5, $6, 'SYNC', '30s', $7, $8)`,
      [
        ver.id,
        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(s.method) ? s.method : (w.add(`method:${s.method}`), 'GET'),
        M.apiBaseUrl(s.endpoint_domain, w),
        M.truncate(s.endpoint_path, 1000),
        M.apiAuthType(s.auth_type, w),
        M.apiUpdateFrequency(s.frequency, w),
        s.sample_body ? JSON.stringify(s.sample_body) : null,
        s.sample_response ? JSON.stringify(s.sample_response) : null,
      ],
    );
  } else {
    await m.query(
      `INSERT INTO data_hub_data_service_version_sftp_specs (data_service_version_id, host, port, auth_type, folder_path,
         file_name_pattern, file_format, export_frequency, encryption, flow_direction)
       VALUES ($1, $2, 22, 'SSH_KEY', $3, $4, $5, $6, 'PGP_KEY', $7)`,
      [
        ver.id,
        M.sftpHost(s.endpoint_domain),
        M.truncate(s.endpoint_path, 1000) || null,
        M.truncate(s.sftp_file_pattern, 500) || null,
        M.sftpFileFormat(s.fileFormat, w),
        M.sftpExportFrequency(s.sftp_frequency, w),
        s.flowDirection === 'PUSH' || s.flowDirection === 'PULL' ? s.flowDirection : null,
      ],
    );
  }
  const link = async (table: string, column: string, ids: Array<number | undefined>) => {
    for (const id of new Set(ids.filter((x): x is number => x !== undefined))) {
      await m.query(`INSERT INTO ${table} (data_service_version_id, ${column}) VALUES ($1, $2)`, [ver.id, id]);
    }
  };
  await link(
    'data_hub_data_service_version_consumers',
    'consumer_id',
    (s.subscribers ?? []).map((c: string) => r.consumerIds.get(c.toUpperCase())),
  );
  await link('data_hub_data_service_version_requesters', 'user_id', [r.userId(s.bu_contact)]);
  await link('data_hub_data_service_version_it_supporters', 'user_id', [r.userId(s.technical_contact)]);
  await m.query(`UPDATE data_hub_data_services SET active_version_id = $1 WHERE id = $2`, [ver.id, pkg.id]);
  await m.query(
    `INSERT INTO data_hub_data_service_histories (data_service_id, data_service_version_id, version_no, action,
       change_note, changes, changed_by) VALUES ($1, $2, 1, 'CREATE', 'Imported from mock data', '[]', $3)`,
    [pkg.id, ver.id, owner],
  );
}

async function main() {
  if (!dataDir || !fs.existsSync(path.join(dataDir, 'data-services.json'))) {
    throw new Error('Usage: seed-data-hub-mock-data.ts <mock>/data-exchange/data [--user-id N] [--schema S]');
  }
  const ds = new DataSource({
    type: 'postgres',
    host: DB_HOST,
    port: DB_PORT,
    username: DB_USERNAME,
    password: DB_PASSWORD,
    database: DB_NAME,
    extra: schema ? { max: 1, options: `-c search_path=${schema}` } : undefined,
  });
  await ds.initialize();
  const warnings = new M.MapWarnings();
  try {
    const stats = await ds.transaction((m) => seed(m, warnings));
    console.log('Data Hub mock seed done:', stats);
    if (warnings.counts.size) console.log('Approximated values:', Object.fromEntries(warnings.counts));
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => {
  console.error('Seed failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
