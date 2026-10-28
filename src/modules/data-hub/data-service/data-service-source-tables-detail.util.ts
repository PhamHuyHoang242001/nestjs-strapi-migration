import { DataSource } from 'typeorm';
import { liveSql } from '../common/data-hub-query.util';
import { queryRows } from './data-service-query-rows.util';

export interface DetailSourceTable {
  id: number;
  name: string;
  description: string | null;
  terms: Array<{
    id: number;
    code: string;
    technical_description: string;
    example_value: string | null;
    logical_term: { id: number; code: string } | null;
  }>;
}

// Every source table of a version with all its terms (the edit form needs the whole set), tables A→Z.
export async function loadVersionSourceTables(dataSource: DataSource, versionId: number): Promise<DetailSourceTable[]> {
  const rows = await queryRows<{
    st_id: number;
    st_name: string;
    st_description: string | null;
    id: number;
    code: string;
    technical_description: string;
    example_value: string | null;
    logical_id: number | null;
    logical_code: string | null;
  }>(
    dataSource,
    `SELECT st.id AS st_id, st.name AS st_name, st.description AS st_description,
            p.id, p.code, p.technical_description, p.example_value, lt.id AS logical_id, lt.code AS logical_code
     FROM data_hub_data_service_version_physical_terms vp
     JOIN data_hub_physical_terms p ON p.id = vp.physical_term_id AND ${liveSql('p')}
     JOIN data_hub_source_tables st ON st.id = p.source_table_id
     LEFT JOIN data_hub_logical_terms lt ON lt.id = p.logical_term_id AND ${liveSql('lt')}
     WHERE vp.data_service_version_id = $1
     ORDER BY st.name, st.id, p.id`,
    [versionId],
  );
  const groups = new Map<number, DetailSourceTable>();
  for (const r of rows) {
    const key = Number(r.st_id);
    if (!groups.has(key)) groups.set(key, { id: key, name: r.st_name, description: r.st_description, terms: [] });
    groups.get(key)?.terms.push({
      id: Number(r.id),
      code: r.code,
      technical_description: r.technical_description,
      example_value: r.example_value,
      logical_term:
        r.logical_id === null || r.logical_code === null ? null : { id: Number(r.logical_id), code: r.logical_code },
    });
  }
  return [...groups.values()];
}
