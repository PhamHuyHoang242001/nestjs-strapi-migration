// Rows of the API / SFTP export, in the import template's column keys and value forms (codes,
// emails and app codes as `;` lists, JSON as text), so an exported file imports back as is.
import { DataSource } from 'typeorm';
import { liveSql } from '../common/data-hub-query.util';
import { listCell } from '../import/layout-export.util';

interface VersionExportRow {
  version_id: number;
  name: string;
  short_description: string;
  purpose: string | null;
  service_ops: string | null;
  it_support: { email?: string | null; phone?: string | null; link?: string | null } | null;
  usage_guide_html: string;
  request_unit: string | null;
  division: string | null;
  department: string | null;
  consumers: string[] | null;
  requesters: string[] | null;
  owners: string[] | null;
  method: string | null;
  domain: string | null;
  endpoint_path: string | null;
  auth_type: string | null;
  api_encryption: string | null;
  peak_tps: string | null;
  update_frequency: string | null;
  sync_mode: string | null;
  timeout: string | null;
  sample_request: unknown;
  sample_response: unknown;
  folder_path: string | null;
  file_name_pattern: string | null;
  flow_direction: string | null;
  sftp_encryption: string | null;
  file_format: string | null;
  export_frequency: string | null;
  max_file_size: string | null;
}

// Linked codes / emails of a version, in link order.
const linked = (table: string, column: string, target: string, value: string) =>
  `ARRAY(SELECT x.${value} FROM ${table} l JOIN ${target} x ON x.id = l.${column}
         WHERE l.data_service_version_id = v.id ORDER BY l.id)`;

const json = (value: unknown): string =>
  value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value);

// Template row of each version, by version id.
export async function loadServiceExportRows(
  dataSource: DataSource,
  versionIds: number[],
): Promise<Map<number, Record<string, string>>> {
  if (versionIds.length === 0) return new Map();
  const rows: VersionExportRow[] = await dataSource.query(
    `SELECT v.id AS version_id, v.name, v.short_description, v.purpose, v.service_ops, v.it_support, v.usage_guide_html,
            ru.code AS request_unit, dv.code AS division, dp.code AS department,
            ${linked('data_hub_data_service_version_consumers', 'consumer_id', 'data_hub_consumers', 'code')} AS consumers,
            ${linked('data_hub_data_service_version_requesters', 'user_id', 'users', 'email')} AS requesters,
            ${linked('data_hub_data_service_version_service_owners', 'user_id', 'users', 'email')} AS owners,
            a.method, dm.url AS domain, a.endpoint_path, a.auth_type, a.encryption AS api_encryption, a.peak_tps,
            a.update_frequency, a.sync_mode, a.timeout, a.sample_request, a.sample_response,
            f.folder_path, f.file_name_pattern, f.flow_direction, f.encryption AS sftp_encryption, f.file_format,
            f.export_frequency, f.max_file_size
     FROM data_hub_data_service_versions v
     LEFT JOIN data_hub_request_units ru ON ru.id = v.request_unit_id
     LEFT JOIN data_hub_divisions dv ON dv.id = v.division_id
     LEFT JOIN data_hub_departments dp ON dp.id = v.department_id
     LEFT JOIN data_hub_data_service_version_api_specs a ON a.data_service_version_id = v.id AND ${liveSql('a')}
     LEFT JOIN integration_domain_configs dm ON dm.id = a.domain_id
     LEFT JOIN data_hub_data_service_version_sftp_specs f ON f.data_service_version_id = v.id AND ${liveSql('f')}
     WHERE v.id = ANY($1)`,
    [versionIds],
  );
  const text = (v: string | null | undefined): string => v ?? '';
  return new Map(
    rows.map((r) => [
      Number(r.version_id),
      {
        name: r.name,
        short_description: r.short_description,
        request_unit: text(r.request_unit),
        consumers: listCell(r.consumers ?? []),
        purpose: text(r.purpose),
        requesters: listCell(r.requesters ?? []),
        it_support_email: text(r.it_support?.email),
        it_support_phone: text(r.it_support?.phone),
        it_support_link: text(r.it_support?.link),
        service_ops: text(r.service_ops),
        method: text(r.method),
        domain: text(r.domain),
        endpoint_path: text(r.endpoint_path),
        auth_type: text(r.auth_type),
        encryption: text(r.api_encryption ?? r.sftp_encryption),
        peak_tps: text(r.peak_tps),
        update_frequency: text(r.update_frequency),
        sync_mode: text(r.sync_mode),
        timeout: text(r.timeout),
        sample_request: json(r.sample_request),
        sample_response: json(r.sample_response),
        folder_path: text(r.folder_path),
        file_name_pattern: text(r.file_name_pattern),
        flow_direction: text(r.flow_direction),
        file_format: text(r.file_format),
        export_frequency: text(r.export_frequency),
        max_file_size: text(r.max_file_size),
        usage_guide_html: r.usage_guide_html,
        division: text(r.division),
        department: text(r.department),
        service_owners: listCell(r.owners ?? []),
      },
    ]),
  );
}
