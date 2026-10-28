import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DATA_HUB_API_BASE_URL_HOSTS, DataHubApiBaseUrl } from '@modules/databases/data-hub-enums';
import { DataHubUserRefService } from '../common/data-hub-user-ref.service';
import { activeSql, liveSql } from '../common/data-hub-query.util';
import { loadSoAppUserIds } from '../consumer/consumer-so-apps.util';
import { loadVersionSourceTables } from './data-service-source-tables-detail.util';
import { queryRows } from './data-service-query-rows.util';
import { API_SPEC_FIELDS, ApiSpecInput, SFTP_SPEC_FIELDS, SftpSpecInput } from './data-service-spec.types';

interface DetailRow {
  id: number;
  service_code: string;
  service_type: string;
  status: string;
  active_version_id: number;
  created_by: number;
  updated_by: number | null;
  created_at: Date;
  updated_at: Date;
  version_no: number;
  state: string;
  name: string;
  short_description: string;
  purpose: string | null;
  usage_guide_html: string;
  changelog_note: string | null;
  submitted_by: number;
  reviewed_by: number | null;
  reviewed_at: Date | null;
  version_created_at: Date;
  request_unit_id: number;
  request_unit_code: string;
  request_unit_name: string;
  division_id: number;
  division_code: string;
  division_name: string;
  department_id: number;
  department_code: string;
  department_name: string;
}

interface ConsumerRow {
  id: number;
  code: string;
  name: string;
  category: string;
  short_description: string;
}

const specColumns = (alias: string, fields: readonly string[]) => fields.map((f) => `${alias}.${f}`).join(', ');
const orgRef = (id: number, code: string, name: string) => ({ id: Number(id), code, name });

// Detail screen of one data service (always its active version).
@Injectable()
export class DataHubDataServiceDetailQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly userRefs: DataHubUserRefService,
  ) {}

  async detail(id: number) {
    const [row] = await queryRows<DetailRow>(
      this.dataSource,
      `SELECT s.id, s.service_code, s.service_type, s.status, s.active_version_id, s.created_by, s.updated_by,
              s.created_at, s.updated_at,
              v.version_no, v.state, v.name, v.short_description, v.purpose, v.usage_guide_html,
              v.changelog_note, v.submitted_by, v.reviewed_by, v.reviewed_at,
              v.created_at AS version_created_at,
              v.request_unit_id, ru.code AS request_unit_code, ru.name AS request_unit_name,
              v.division_id, d.code AS division_code, d.name AS division_name,
              v.department_id, dp.code AS department_code, dp.name AS department_name
       FROM data_hub_data_services s
       JOIN data_hub_data_service_versions v ON v.id = s.active_version_id AND ${liveSql('v')}
       JOIN data_hub_divisions d ON d.id = v.division_id
       JOIN data_hub_departments dp ON dp.id = v.department_id
       JOIN data_hub_request_units ru ON ru.id = v.request_unit_id
       WHERE s.id = $1 AND ${liveSql('s')}`,
      [id],
    );
    if (!row) throw new NotFoundException('DATA_SERVICE_NOT_FOUND');
    const versionId = Number(row.active_version_id);

    const link = (table: string) =>
      queryRows<{ user_id: number }>(
        this.dataSource,
        `SELECT l.user_id FROM ${table} l WHERE l.data_service_version_id = $1 ORDER BY l.id`,
        [versionId],
      );
    const [apiRows, sftpRows, requesters, supporters, consumers, termCount, pending, sourceTables] = await Promise.all([
      queryRows<ApiSpecInput>(
        this.dataSource,
        `SELECT ${specColumns('a', API_SPEC_FIELDS)} FROM data_hub_data_service_version_api_specs a
         WHERE a.data_service_version_id = $1 AND ${liveSql('a')}`,
        [versionId],
      ),
      queryRows<SftpSpecInput>(
        this.dataSource,
        `SELECT ${specColumns('sf', SFTP_SPEC_FIELDS)} FROM data_hub_data_service_version_sftp_specs sf
         WHERE sf.data_service_version_id = $1 AND ${liveSql('sf')}`,
        [versionId],
      ),
      link('data_hub_data_service_version_requesters'),
      link('data_hub_data_service_version_it_supporters'),
      queryRows<ConsumerRow>(
        this.dataSource,
        `SELECT c.id, c.code, c.name, c.category, c.short_description
         FROM data_hub_data_service_version_consumers vc
         JOIN data_hub_consumers c ON c.id = vc.consumer_id AND ${activeSql('c')}
         WHERE vc.data_service_version_id = $1 ORDER BY c.code`,
        [versionId],
      ),
      queryRows<{ term_count: number }>(
        this.dataSource,
        `SELECT COUNT(*)::int AS term_count FROM data_hub_data_service_version_physical_terms vp
         JOIN data_hub_physical_terms pt ON pt.id = vp.physical_term_id AND ${liveSql('pt')}
         WHERE vp.data_service_version_id = $1`,
        [versionId],
      ),
      queryRows<{ id: number }>(
        this.dataSource,
        `SELECT pv.id FROM data_hub_data_service_versions pv
         WHERE pv.data_service_id = $1 AND pv.state = 'pending' AND ${liveSql('pv')} LIMIT 1`,
        [id],
      ),
      loadVersionSourceTables(this.dataSource, versionId),
    ]);

    const requesterIds = requesters.map((r) => Number(r.user_id));
    const supporterIds = supporters.map((r) => Number(r.user_id));
    const ownerIds = (await link('data_hub_data_service_version_service_owners')).map((r) => Number(r.user_id));
    const soAppIds = await loadSoAppUserIds(
      this.dataSource,
      consumers.map((c) => Number(c.id)),
    );
    const users = await this.userRefs.resolve([
      row.created_by,
      row.updated_by,
      row.submitted_by,
      row.reviewed_by,
      ...requesterIds,
      ...supporterIds,
      ...ownerIds,
      ...[...soAppIds.values()].flat(),
    ]);

    const api = apiRows[0]
      ? { ...apiRows[0], base_url_host: DATA_HUB_API_BASE_URL_HOSTS[apiRows[0].base_url as DataHubApiBaseUrl] ?? null }
      : null;
    return {
      id: Number(row.id),
      service_code: row.service_code,
      service_type: row.service_type,
      status: row.status,
      active_version_id: versionId,
      pending_version_id: pending[0] ? Number(pending[0].id) : null,
      created_by_user: this.userRefs.toRef(users, row.created_by),
      updated_by_user: this.userRefs.toRef(users, row.updated_by),
      created_at: row.created_at,
      updated_at: row.updated_at,
      // Live version; named version_active so a future review flow can add a pending `version` without a clash.
      version_active: {
        id: versionId,
        version_no: Number(row.version_no),
        state: row.state,
        name: row.name,
        short_description: row.short_description,
        purpose: row.purpose,
        usage_guide_html: row.usage_guide_html,
        changelog_note: row.changelog_note,
        submitted_by_user: this.userRefs.toRef(users, row.submitted_by),
        reviewed_by_user: this.userRefs.toRef(users, row.reviewed_by),
        reviewed_at: row.reviewed_at,
        created_at: row.version_created_at,
        request_unit: orgRef(row.request_unit_id, row.request_unit_code, row.request_unit_name),
        division: orgRef(row.division_id, row.division_code, row.division_name),
        department: orgRef(row.department_id, row.department_code, row.department_name),
        api_spec: api,
        sftp_spec: sftpRows[0] ?? null,
        requesters: this.userRefs.toRefs(users, requesterIds),
        it_supporters: this.userRefs.toRefs(users, supporterIds),
        service_owners: this.userRefs.toRefs(users, ownerIds),
        consumers: consumers.map((c) => ({
          id: Number(c.id),
          code: c.code,
          name: c.name,
          category: c.category,
          short_description: c.short_description,
          so_apps: this.userRefs.toRefs(users, soAppIds.get(Number(c.id)) ?? []),
        })),
        term_count: Number(termCount[0]?.term_count ?? 0),
        // Bảng nguồn dịch vụ of this version, each with its terms (also what the edit form loads).
        source_tables: sourceTables,
      },
    };
  }
}
