import { DataSource, EntityManager } from 'typeorm';
import { activeSql, DataHubPageMeta, escapeLike, liveSql, searchTerm, toPaging } from './data-hub-query.util';

type Runner = DataSource | EntityManager;

// Which physical terms a grouped read covers, as a condition on alias `p` (data_hub_physical_terms) whose
// placeholders start at $1. Each screen builds its own: a service's active version, the active services of a
// consumer, or the whole dictionary.
export interface TermScope {
  sql: string;
  params: unknown[];
}

export interface SourceTableGroup {
  id: number;
  name: string;
  description: string | null;
  term_count: number;
}

export interface GroupedTerm {
  id: number;
  code: string;
  technical_description: string;
  example_value: string | null;
  logical_term: { id: number; code: string } | null;
  data_service: { id: number; service_code: string; name: string };
}

// Extra conditions on the table (alias `st`); `bind` appends a parameter and returns its placeholder.
export type SourceTableFilter = (bind: (value: unknown) => string) => string[];

// Source tables holding at least one term of the scope, newest first, with the number of those terms.
// `keyword` matches the table name/description or a term code/description inside the scope.
export async function listSourceTableGroups(
  runner: Runner,
  scope: TermScope,
  q: { keyword?: string; page?: number; limit?: number },
  filter?: SourceTableFilter,
): Promise<{ data: SourceTableGroup[]; meta: DataHubPageMeta }> {
  const { page, limit, offset } = toPaging(q);
  const params = [...scope.params];
  let search = '';
  const text = searchTerm(q.keyword);
  if (text) {
    params.push(`%${escapeLike(text)}%`);
    const n = params.length;
    search = `AND (st.name ILIKE $${n} ESCAPE '\\' OR st.description ILIKE $${n} ESCAPE '\\'
               OR EXISTS (SELECT 1 FROM data_hub_physical_terms p WHERE p.source_table_id = st.id AND ${liveSql('p')}
                          AND (${scope.sql}) AND (p.code ILIKE $${n} ESCAPE '\\' OR p.technical_description ILIKE $${n} ESCAPE '\\')))`;
  }
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  search += (filter?.(bind) ?? []).map((c) => ` AND (${c})`).join('');
  const inScope = `FROM data_hub_physical_terms p WHERE p.source_table_id = st.id AND ${liveSql('p')} AND (${scope.sql})`;
  // The total only needs "has a term in scope" (same rows as term_count > 0) so it stops at the first term;
  // the page counts the terms of its own rows only.
  const [[count], rows] = await Promise.all([
    runner.query<Array<{ total: number }>>(
      `SELECT COUNT(*)::int AS total FROM data_hub_source_tables st
       WHERE ${liveSql('st')} AND EXISTS (SELECT 1 ${inScope}) ${search}`,
      params,
    ),
    runner.query<SourceTableGroup[]>(
      `SELECT st.id, st.name, st.description, tc.term_count FROM data_hub_source_tables st
       JOIN LATERAL (SELECT COUNT(*)::int AS term_count ${inScope}) tc ON tc.term_count > 0
       WHERE ${liveSql('st')} ${search}
       ORDER BY st.created_at DESC, st.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
  ]);
  return {
    data: rows.map((r) => ({ ...r, id: Number(r.id), term_count: Number(r.term_count) })),
    meta: { total: Number(count?.total ?? 0), page, limit },
  };
}

// A page of groups with their terms nested (one batched query for the page's terms), so the screens expand a
// group without another call.
export async function listSourceTableGroupsWithTerms(
  runner: Runner,
  scope: TermScope,
  q: { keyword?: string; page?: number; limit?: number },
  filter?: SourceTableFilter,
): Promise<{ data: Array<SourceTableGroup & { physical_terms: GroupedTerm[] }>; meta: DataHubPageMeta }> {
  const res = await listSourceTableGroups(runner, scope, q, filter);
  const terms = await listGroupsTerms(
    runner,
    scope,
    res.data.map((g) => g.id),
  );
  return { ...res, data: res.data.map((g) => ({ ...g, physical_terms: terms.get(g.id) ?? [] })) };
}

// Terms of one source table inside the scope (not paged: a table rarely holds many terms of one scope).
export async function listGroupTerms(runner: Runner, scope: TermScope, sourceTableId: number): Promise<GroupedTerm[]> {
  return (await listGroupsTerms(runner, scope, [sourceTableId])).get(sourceTableId) ?? [];
}

// Terms inside the scope of several source tables in one query, keyed by source table id.
export async function listGroupsTerms(
  runner: Runner,
  scope: TermScope,
  sourceTableIds: number[],
): Promise<Map<number, GroupedTerm[]>> {
  const out = new Map<number, GroupedTerm[]>();
  if (sourceTableIds.length === 0) return out;
  const n = scope.params.length + 1;
  const rows: Array<{
    id: number;
    source_table_id: number;
    code: string;
    technical_description: string;
    example_value: string | null;
    logical_id: number | null;
    logical_code: string | null;
    ds_id: number;
    service_code: string;
    service_name: string | null;
  }> = await runner.query(
    `SELECT p.id, p.source_table_id, p.code, p.technical_description, p.example_value,
            lt.id AS logical_id, lt.code AS logical_code,
            s.id AS ds_id, s.service_code, v.name AS service_name
     FROM data_hub_physical_terms p
     JOIN data_hub_data_services s ON s.id = p.data_service_id
     LEFT JOIN data_hub_data_service_versions v ON v.id = s.active_version_id
     LEFT JOIN data_hub_logical_terms lt ON lt.id = p.logical_term_id AND ${liveSql('lt')}
     WHERE p.source_table_id = ANY($${n}::int[]) AND ${liveSql('p')} AND (${scope.sql})
     ORDER BY p.created_at DESC, p.id DESC`,
    [...scope.params, sourceTableIds],
  );
  for (const r of rows) {
    const list = out.get(Number(r.source_table_id)) ?? [];
    list.push({
      id: Number(r.id),
      code: r.code,
      technical_description: r.technical_description,
      example_value: r.example_value,
      logical_term:
        r.logical_id === null || r.logical_code === null ? null : { id: Number(r.logical_id), code: r.logical_code },
      data_service: { id: Number(r.ds_id), service_code: r.service_code, name: r.service_name ?? '' },
    });
    out.set(Number(r.source_table_id), list);
  }
  return out;
}

// Scope: terms on a service's active version.
export const serviceVersionScope = (versionId: number): TermScope => ({
  sql: `p.id IN (SELECT vp.physical_term_id FROM data_hub_data_service_version_physical_terms vp
                 WHERE vp.data_service_version_id = $1)`,
  params: [versionId],
});

// A physical term is shown (dictionary lists, pickers, counts) only while it is live and its owning service is live,
// active and has a live active version: deactivating or deleting a service hides its terms everywhere.
export const termOfActiveServiceSql = (alias: string): string =>
  `${liveSql(alias)} AND EXISTS (SELECT 1 FROM data_hub_data_services os
                                 JOIN data_hub_data_service_versions ov ON ov.id = os.active_version_id AND ${liveSql('ov')}
                                 WHERE os.id = ${alias}.data_service_id AND ${activeSql('os')})`;

// Scope: the whole dictionary.
export const dictionaryScope = (): TermScope => ({ sql: termOfActiveServiceSql('p'), params: [] });

// Source tables (alias `st`) a caller may put on a service (form picker and the save check share this rule):
// - the edited service $serviceParam (may be NULL) already holds terms in it — so a moved or inactive service keeps
//   its own tables; otherwise
// - the table still holds a term of an active service (a table used only by inactive services still exists and
//   keeps its name, but cannot be picked by another service), and it belongs to one of the departments in
//   $deptsParam (an int[]; NULL = every department, super_admin): created there, or used by an active service whose
//   active version is there.
export const sourceTableScopeSql = (
  deptsParam: string,
  serviceParam: string,
): string => `(EXISTS (SELECT 1 FROM data_hub_physical_terms sp
             WHERE sp.source_table_id = st.id AND ${liveSql('sp')} AND sp.data_service_id = ${serviceParam})
  OR (EXISTS (SELECT 1 FROM data_hub_physical_terms ap WHERE ap.source_table_id = st.id AND ${termOfActiveServiceSql('ap')})
      AND (${deptsParam} IS NULL OR st.department_id = ANY(${deptsParam})
           OR EXISTS (SELECT 1 FROM data_hub_physical_terms sp
                      JOIN data_hub_data_services ss ON ss.id = sp.data_service_id AND ${activeSql('ss')}
                      JOIN data_hub_data_service_versions sv ON sv.id = ss.active_version_id AND ${liveSql('sv')}
                      WHERE sp.source_table_id = st.id AND ${liveSql('sp')} AND sv.department_id = ANY(${deptsParam})))))`;
