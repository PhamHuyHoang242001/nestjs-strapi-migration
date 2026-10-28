import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DataHubUserRefService } from '../common/data-hub-user-ref.service';
import { liveSql } from '../common/data-hub-query.util';
import { RefItem, DiffSnapshot } from './data-service-diff.util';
import { queryRows } from './data-service-query-rows.util';
import { buildSnapshot, ResolvedRefs } from './data-service-snapshot.util';
import {
  API_SPEC_FIELDS,
  ApiSpecInput,
  SFTP_SPEC_FIELDS,
  SftpSpecInput,
  VersionSource,
} from './data-service-spec.types';

export interface RefIds {
  request_unit_id: number;
  division_id: number;
  department_id: number;
  consumer_ids: number[];
  physical_term_ids: number[];
  requester_user_ids: number[];
  it_supporter_user_ids: number[];
}

export interface LoadedVersion {
  version_no: number;
  source: VersionSource;
  snapshot: DiffSnapshot;
}

// version_no + the VersionSource columns of a stored version row.
type VersionRow = Omit<
  VersionSource,
  'api_spec' | 'sftp_spec' | 'requester_user_ids' | 'it_supporter_user_ids' | 'consumer_ids' | 'physical_term_ids'
> & { version_no: number };

const unique = (ids: number[]): number[] => Array.from(new Set(ids));

interface TermRow {
  id: number;
  code: string;
  technical_description: string;
  example_value: string | null;
  source_table_id: number;
  source_table: string;
  source_table_description: string | null;
  logical_code: string | null;
}

// Labelled terms of a version plus the source tables they sit in.
export interface ResolvedTerms {
  physicalTerms: RefItem[];
  sourceTables: RefItem[];
}

const termItem = (r: TermRow): RefItem => {
  const example = r.example_value ? ` (vd: ${r.example_value})` : '';
  const logical = r.logical_code ? ` → ${r.logical_code}` : '';
  const label = `${r.source_table}.${r.code} — ${r.technical_description}${example}${logical}`;
  return { key: `${Number(r.id)}|${label}`, label };
};
// One item per table; name and description are in the key so editing only the table shows as a change.
const tableItems = (rows: TermRow[]): RefItem[] => {
  const byId = new Map<number, RefItem>();
  for (const r of rows) {
    const label = r.source_table_description ? `${r.source_table} — ${r.source_table_description}` : r.source_table;
    byId.set(Number(r.source_table_id), { key: `${Number(r.source_table_id)}|${label}`, label });
  }
  return [...byId.values()];
};
const resolvedTerms = (rows: TermRow[]): ResolvedTerms => ({
  physicalTerms: rows.map(termItem),
  sourceTables: tableItems(rows),
});
const missing = (wanted: number[], rows: Array<{ id: number }>): number[] => {
  const found = new Set(rows.map((r) => Number(r.id)));
  return wanted.filter((id) => !found.has(id));
};

// Resolves the ids of a version into labelled refs. `strict` (writes) validates that every id exists and is live
// and throws INVALID_*; non-strict (reading a stored version) never filters, so history of rows that were later
// deleted or deactivated still renders.
@Injectable()
export class DataServiceSnapshotService {
  constructor(private readonly userRefs: DataHubUserRefService) {}

  async resolveRefs(manager: EntityManager, ids: RefIds, strict: boolean): Promise<ResolvedRefs> {
    const consumerIds = unique(ids.consumer_ids);
    const termIds = unique(ids.physical_term_ids);
    const requesterIds = unique(ids.requester_user_ids);
    const supporterIds = unique(ids.it_supporter_user_ids);

    // Sequential on purpose: all queries share one transaction connection.
    const requestUnit = await this.orgRef(
      manager,
      'data_hub_request_units',
      ids.request_unit_id,
      'INVALID_REQUEST_UNIT',
      strict,
    );
    const division = await this.orgRef(manager, 'data_hub_divisions', ids.division_id, 'INVALID_DIVISION', strict);
    const department = await this.orgRef(
      manager,
      'data_hub_departments',
      ids.department_id,
      'INVALID_DEPARTMENT',
      strict,
    );

    const consumerRows = consumerIds.length
      ? await queryRows<{ id: number; code: string }>(
          manager,
          `SELECT c.id, c.code FROM data_hub_consumers c
           WHERE c.id = ANY($1)${strict ? ` AND ${liveSql('c')} AND c.status = 'active'` : ''}`,
          [consumerIds],
        )
      : [];
    if (strict && consumerRows.length !== consumerIds.length) {
      throw new BadRequestException(
        `INVALID_CONSUMERS: ${missing(consumerIds, consumerRows).join(',')} not found or inactive`,
      );
    }

    const termRows = await this.termRows(manager, termIds, strict);
    if (strict && termRows.length !== termIds.length) {
      throw new BadRequestException(`INVALID_PHYSICAL_TERMS: ${missing(termIds, termRows).join(',')} not found`);
    }

    if (strict) await this.userRefs.assertUsers(manager, [...requesterIds, ...supporterIds]);
    const users = await this.userRefs.resolve([...requesterIds, ...supporterIds], manager);
    const toUserItems = (list: number[]): RefItem[] =>
      list.map((id) => ({ key: id, label: users.get(id)?.email ?? `#${id}` }));

    return {
      requestUnit,
      division,
      department,
      consumers: consumerRows.map((r) => ({ key: Number(r.id), label: r.code })),
      ...resolvedTerms(termRows),
      requesters: toUserItems(requesterIds),
      itSupporters: toUserItems(supporterIds),
    };
  }

  // Full stored state of one version (content + spec + links) and its diff snapshot.
  async loadVersion(manager: EntityManager, versionId: number): Promise<LoadedVersion> {
    const [row] = await queryRows<VersionRow>(
      manager,
      `SELECT v.version_no, v.name, v.short_description, v.purpose, v.usage_guide_html,
              v.request_unit_id, v.division_id, v.department_id
       FROM data_hub_data_service_versions v WHERE v.id = $1`,
      [versionId],
    );
    if (!row) throw new BadRequestException('INVALID_VERSION: version not found');
    const specSql = (table: string, fields: readonly string[]) =>
      `SELECT ${fields.map((f) => `s.${f}`).join(', ')} FROM ${table} s
       WHERE s.data_service_version_id = $1 AND ${liveSql('s')}`;
    const linkSql = (table: string, column: string) =>
      `SELECT l.${column} AS id FROM ${table} l WHERE l.data_service_version_id = $1 ORDER BY l.${column}`;
    const links = (table: string, column: string) =>
      queryRows<{ id: number }>(manager, linkSql(table, column), [versionId]);
    const apiRows = await queryRows<ApiSpecInput>(
      manager,
      specSql('data_hub_data_service_version_api_specs', API_SPEC_FIELDS),
      [versionId],
    );
    const sftpRows = await queryRows<SftpSpecInput>(
      manager,
      specSql('data_hub_data_service_version_sftp_specs', SFTP_SPEC_FIELDS),
      [versionId],
    );
    const requesters = await links('data_hub_data_service_version_requesters', 'user_id');
    const supporters = await links('data_hub_data_service_version_it_supporters', 'user_id');
    const consumers = await links('data_hub_data_service_version_consumers', 'consumer_id');
    const terms = await links('data_hub_data_service_version_physical_terms', 'physical_term_id');
    const ids = (rows: Array<{ id: number }>) => rows.map((r) => Number(r.id));
    const source: VersionSource = {
      ...row,
      request_unit_id: Number(row.request_unit_id),
      division_id: Number(row.division_id),
      department_id: Number(row.department_id),
      api_spec: apiRows[0] ?? null,
      sftp_spec: sftpRows[0] ?? null,
      requester_user_ids: ids(requesters),
      it_supporter_user_ids: ids(supporters),
      consumer_ids: ids(consumers),
      physical_term_ids: ids(terms),
    };
    const refs = await this.resolveRefs(manager, source, false);
    return { version_no: Number(row.version_no), source, snapshot: buildSnapshot(source, refs) };
  }

  // Labelled physical terms of a version; the label carries the source table, every field of the term and its
  // logical term so an edited or re-mapped term shows up in the change log.
  async resolveTerms(manager: EntityManager, ids: number[]): Promise<ResolvedTerms> {
    return resolvedTerms(await this.termRows(manager, unique(ids), true));
  }

  private async termRows(manager: EntityManager, ids: number[], strict: boolean): Promise<TermRow[]> {
    if (ids.length === 0) return [];
    return queryRows<TermRow>(
      manager,
      `SELECT t.id, t.code, t.technical_description, t.example_value, t.source_table_id,
              st.name AS source_table, st.description AS source_table_description, lt.code AS logical_code
       FROM data_hub_physical_terms t JOIN data_hub_source_tables st ON st.id = t.source_table_id
       LEFT JOIN data_hub_logical_terms lt ON lt.id = t.logical_term_id AND ${liveSql('lt')}
       WHERE t.id = ANY($1)${strict ? ` AND ${liveSql('t')}` : ''}
       ORDER BY st.name, t.code, t.id`,
      [ids],
    );
  }

  private async orgRef(
    manager: EntityManager,
    table: string,
    id: number,
    errorCode: string,
    strict: boolean,
  ): Promise<RefItem | null> {
    const rows = await queryRows<{ id: number; code: string }>(
      manager,
      `SELECT t.id, t.code FROM ${table} t WHERE t.id = $1${strict ? ` AND ${liveSql('t')}` : ''}`,
      [id],
    );
    if (!rows[0]) {
      if (strict) throw new BadRequestException(`${errorCode}: ${id} not found`);
      return null;
    }
    return { key: Number(rows[0].id), label: rows[0].code };
  }
}
