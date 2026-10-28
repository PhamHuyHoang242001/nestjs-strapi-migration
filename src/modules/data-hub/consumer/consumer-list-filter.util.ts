import { liveSql, escapeLike, searchTerm } from '../common/data-hub-query.util';

export interface ConsumerListFilter {
  keyword?: string;
  category?: string;
  status?: 'active' | 'inactive' | 'all';
  division_ids?: number[];
  logical_term_ids?: number[];
  connection_type?: string;
}

// A consumer "counts" for a service only through the ACTIVE version of an ACTIVE live package:
// pending/old versions and inactive packages must not inflate api/sftp/term counts.
export const ACTIVE_LINK_FROM = `data_hub_data_service_version_consumers l
  JOIN data_hub_data_services ds
    ON ds.active_version_id = l.data_service_version_id AND ${liveSql('ds')} AND ds.status = 'active'
  JOIN data_hub_data_service_versions v
    ON v.id = ds.active_version_id AND ${liveSql('v')} AND v.state = 'approved'`;

// WHERE clause (alias `c` = data_hub_consumers) with bound params; shared by list and export.
export function buildConsumerWhere(f: ConsumerListFilter): { where: string; params: unknown[] } {
  const params: unknown[] = [];
  const conds: string[] = [liveSql('c')];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  const status = f.status ?? 'active';
  if (status !== 'all') conds.push(`c.status = ${bind(status)}`);
  if (f.category) conds.push(`c.category = ${bind(f.category)}`);
  if (f.division_ids?.length) conds.push(`c.division_id = ANY(${bind(f.division_ids)})`);

  const search = searchTerm(f.keyword);
  if (search) {
    const p = bind(`%${escapeLike(search)}%`);
    conds.push(
      `(c.code ILIKE ${p} ESCAPE '\\' OR c.name ILIKE ${p} ESCAPE '\\' OR c.short_description ILIKE ${p} ESCAPE '\\')`,
    );
  }
  if (f.connection_type) {
    conds.push(
      `EXISTS (SELECT 1 FROM ${ACTIVE_LINK_FROM} WHERE l.consumer_id = c.id AND ds.service_type = ${bind(f.connection_type)})`,
    );
  }
  if (f.logical_term_ids?.length) {
    conds.push(`EXISTS (
      SELECT 1 FROM ${ACTIVE_LINK_FROM}
      JOIN data_hub_data_service_version_physical_terms vpt ON vpt.data_service_version_id = ds.active_version_id
      JOIN data_hub_physical_terms pt ON pt.id = vpt.physical_term_id AND ${liveSql('pt')}
      WHERE l.consumer_id = c.id AND pt.logical_term_id = ANY(${bind(f.logical_term_ids)}))`);
  }
  return { where: conds.join(' AND '), params };
}
