import { activeSql, escapeLike, liveSql, searchTerm } from '../common/data-hub-query.util';
import { ListDataServiceQueryDto } from './dto';

export interface ListFilterInput extends ListDataServiceQueryDto {
  ids?: number[];
}

// FROM + joins of the catalog read model: live package -> its active version -> org names + optional specs.
// Org names are joined without a live check so a service never disappears because a lookup row was retired.
export const LIST_FROM_SQL = `
  FROM data_hub_data_services s
  JOIN data_hub_data_service_versions v ON v.id = s.active_version_id AND ${liveSql('v')}
  JOIN data_hub_divisions d ON d.id = v.division_id
  JOIN data_hub_departments dp ON dp.id = v.department_id
  JOIN data_hub_request_units ru ON ru.id = v.request_unit_id
  LEFT JOIN data_hub_data_service_version_api_specs a ON a.data_service_version_id = v.id AND ${liveSql('a')}
  LEFT JOIN data_hub_data_service_version_sftp_specs sf ON sf.data_service_version_id = v.id AND ${liveSql('sf')}`;

// Default list order everywhere in Data Hub: newest records first (id breaks created_at ties).
const ORDER_BY: Record<string, string> = {
  newest: 's.created_at DESC, s.id DESC',
  name: 'v.name ASC, s.id ASC',
  code: 's.service_code ASC, s.id ASC',
};

export const listOrderBy = (sort?: string): string => ORDER_BY[sort ?? 'newest'] ?? ORDER_BY.newest;

// WHERE clause + bound params. Every user-supplied value is a parameter; only fixed fragments are concatenated.
export function buildListWhere(q: ListFilterInput): { where: string; params: unknown[] } {
  const params: unknown[] = [];
  const bind = (value: unknown, cast = ''): string => {
    params.push(value);
    return `$${params.length}${cast}`;
  };
  const conditions: string[] = [liveSql('s')];

  const status = q.status ?? 'active';
  if (status !== 'all') conditions.push(`s.status = ${bind(status)}`);
  if (q.service_type) conditions.push(`s.service_type = ${bind(q.service_type)}`);
  if (q.ids?.length) conditions.push(`s.id = ANY(${bind(q.ids, '::int[]')})`);

  const text = searchTerm(q.keyword);
  if (text) {
    const p = bind(`%${escapeLike(text)}%`);
    conditions.push(
      `(s.service_code ILIKE ${p} OR v.name ILIKE ${p} OR v.short_description ILIKE ${p} OR a.endpoint_path ILIKE ${p})`,
    );
  }

  const inList = (column: string, values: unknown[] | undefined, cast: string) => {
    if (values?.length) conditions.push(`${column} = ANY(${bind(values, cast)})`);
  };
  inList('a.method', q.methods, '::text[]');
  inList('sf.flow_direction', q.flow_directions, '::text[]');
  inList('a.update_frequency', q.update_frequencies, '::text[]');
  inList('sf.export_frequency', q.export_frequencies, '::text[]');
  inList('sf.file_format', q.file_formats, '::text[]');
  inList('v.division_id', q.division_ids, '::int[]');
  inList('v.department_id', q.department_ids, '::int[]');
  inList('v.request_unit_id', q.request_unit_ids, '::int[]');

  if (q.consumer_ids?.length) {
    conditions.push(
      `EXISTS (SELECT 1 FROM data_hub_data_service_version_consumers fc
               JOIN data_hub_consumers fcc ON fcc.id = fc.consumer_id AND ${activeSql('fcc')}
               WHERE fc.data_service_version_id = v.id AND fc.consumer_id = ANY(${bind(q.consumer_ids, '::int[]')}))`,
    );
  }
  if (q.physical_term_ids?.length) {
    conditions.push(
      `EXISTS (SELECT 1 FROM data_hub_data_service_version_physical_terms fp
               JOIN data_hub_physical_terms fpt ON fpt.id = fp.physical_term_id AND ${liveSql('fpt')}
               WHERE fp.data_service_version_id = v.id AND fp.physical_term_id = ANY(${bind(q.physical_term_ids, '::int[]')}))`,
    );
  }
  if (q.logical_term_ids?.length) {
    conditions.push(
      `EXISTS (SELECT 1 FROM data_hub_data_service_version_physical_terms fl
               JOIN data_hub_physical_terms flt ON flt.id = fl.physical_term_id AND ${liveSql('flt')}
               WHERE fl.data_service_version_id = v.id AND flt.logical_term_id = ANY(${bind(q.logical_term_ids, '::int[]')}))`,
    );
  }
  return { where: conditions.join(' AND '), params };
}
