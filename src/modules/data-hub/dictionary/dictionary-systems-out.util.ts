import { DataSource } from 'typeorm';
import { escapeLike, liveSql } from '../common/data-hub-query.util';
import { termOfActiveServiceSql } from '../common/source-table-groups.util';

// (physical_term_id, consumer) pairs that are currently exposed: active live package -> its active version ->
// version-linked physical terms x version-linked consumers, keeping only live physical terms and active live consumers.
// Read with raw SQL on purpose so the dictionary never depends on the data-service module.
export const SYSTEMS_OUT_PAIRS_SQL = `(
  SELECT DISTINCT vpt.physical_term_id, c.id AS consumer_id, c.code AS consumer_code, c.name AS consumer_name
  FROM data_hub_data_services ds
  JOIN data_hub_data_service_versions v ON v.id = ds.active_version_id AND ${liveSql('v')}
  JOIN data_hub_data_service_version_physical_terms vpt ON vpt.data_service_version_id = v.id
  JOIN data_hub_physical_terms pt ON pt.id = vpt.physical_term_id AND ${liveSql('pt')}
  JOIN data_hub_data_service_version_consumers vc ON vc.data_service_version_id = v.id
  JOIN data_hub_consumers c ON c.id = vc.consumer_id AND ${liveSql('c')} AND c.status = 'active'
  WHERE ${liveSql('ds')} AND ds.status = 'active'
)`;

export interface SystemOutRef {
  id: number;
  code: string;
  name: string;
}

interface SystemsOutRow {
  physical_term_id: number;
  consumer_id: number;
  consumer_code: string;
  consumer_name: string;
}

// Minimal executor so services and transactions can share the loader.
export type SqlRunner = Pick<DataSource, 'query'>;

// One batched query per call: physical_term_id -> systems out, sorted by consumer code.
export async function loadSystemsOut(runner: SqlRunner, physicalIds: number[]): Promise<Map<number, SystemOutRef[]>> {
  const result = new Map<number, SystemOutRef[]>();
  if (physicalIds.length === 0) return result;
  const rows: SystemsOutRow[] = await runner.query(
    `SELECT so.physical_term_id, so.consumer_id, so.consumer_code, so.consumer_name
     FROM ${SYSTEMS_OUT_PAIRS_SQL} so
     WHERE so.physical_term_id = ANY($1)
     ORDER BY so.consumer_code, so.consumer_id`,
    [physicalIds],
  );
  for (const r of rows) {
    const list = result.get(Number(r.physical_term_id)) ?? [];
    list.push({ id: Number(r.consumer_id), code: r.consumer_code, name: r.consumer_name });
    result.set(Number(r.physical_term_id), list);
  }
  return result;
}

// Distinct consumers across several physical terms, ordered by code.
export function unionSystemsOut(lists: SystemOutRef[][]): SystemOutRef[] {
  const byId = new Map<number, SystemOutRef>();
  for (const list of lists) for (const s of list) byId.set(s.id, s);
  return Array.from(byId.values()).sort((a, b) => a.code.localeCompare(b.code) || a.id - b.id);
}

export interface TermFilter {
  search?: string;
  consumer_ids?: number[];
}

const LIKE = `ILIKE`;
const ESC = `ESCAPE '\\'`;

// Condition on a physical-term alias: column / technical description match.
const physicalSearchSql = (alias: string, n: number): string =>
  `(${alias}.code ${LIKE} $${n} ${ESC} OR ${alias}.technical_description ${LIKE} $${n} ${ESC})`;

// Same pairs as SYSTEMS_OUT_PAIRS_SQL, written as a plain join chain (no DISTINCT) so EXISTS can stop at the
// first match for the physical term instead of building the whole pair set.
const consumerExistsSql = (physAlias: string, n: number): string =>
  `(${liveSql(physAlias)} AND EXISTS (
     SELECT 1 FROM data_hub_data_service_version_physical_terms xvpt
     JOIN data_hub_data_service_versions xv ON xv.id = xvpt.data_service_version_id AND ${liveSql('xv')}
     JOIN data_hub_data_services xds ON xds.active_version_id = xv.id AND ${liveSql('xds')} AND xds.status = 'active'
     JOIN data_hub_data_service_version_consumers xvc ON xvc.data_service_version_id = xv.id
     JOIN data_hub_consumers xc ON xc.id = xvc.consumer_id AND ${liveSql('xc')} AND xc.status = 'active'
     WHERE xvpt.physical_term_id = ${physAlias}.id AND xc.id = ANY($${n})))`;

// Conditions on alias `lt` (data_hub_logical_terms). Pushes bound values onto `params`.
export function buildLogicalTermFilter(q: TermFilter, params: unknown[]): string[] {
  const conds: string[] = [];
  if (q.search) {
    params.push(`%${escapeLike(q.search)}%`);
    const n = params.length;
    conds.push(
      `(lt.code ${LIKE} $${n} ${ESC} OR lt.short_description ${LIKE} $${n} ${ESC}
        OR EXISTS (SELECT 1 FROM data_hub_physical_terms p
                   WHERE p.logical_term_id = lt.id AND ${termOfActiveServiceSql('p')} AND ${physicalSearchSql('p', n)}))`,
    );
  }
  if (q.consumer_ids && q.consumer_ids.length > 0) {
    params.push(q.consumer_ids);
    conds.push(
      `EXISTS (SELECT 1 FROM data_hub_physical_terms p
               WHERE p.logical_term_id = lt.id AND ${termOfActiveServiceSql('p')} AND ${consumerExistsSql('p', params.length)})`,
    );
  }
  return conds;
}

// Conditions on alias `p` for physicals that have no logical term (export tail rows).
export function buildUnmappedPhysicalFilter(q: TermFilter, params: unknown[]): string[] {
  const conds: string[] = ['p.logical_term_id IS NULL'];
  if (q.search) {
    params.push(`%${escapeLike(q.search)}%`);
    conds.push(physicalSearchSql('p', params.length));
  }
  if (q.consumer_ids && q.consumer_ids.length > 0) {
    params.push(q.consumer_ids);
    conds.push(consumerExistsSql('p', params.length));
  }
  return conds;
}
