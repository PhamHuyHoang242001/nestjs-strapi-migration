import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { liveSql } from '../common/data-hub-query.util';
import { lockLogicalTerms } from '../dictionary/logical-term-mapping.util';
import { DataServiceSourceTableInputDto } from './dto';
import { queryRows } from './data-service-query-rows.util';
import { assertSourceTablePayload, lower } from './data-service-source-table-payload.util';
import { deleteEmptyTables, lockTables, resolveTables } from './data-service-source-table-resolve.util';
import { insertTerms } from './data-service-term-insert.util';

export interface SourceTableSyncInput {
  dataServiceId: number;
  // Department of the service: new tables are created in it.
  departmentId: number;
  // Departments whose tables the caller may use (null = all); see sourceTableScopeSql.
  scopeDepartmentIds: number[] | null;
  userId: number;
  groups: DataServiceSourceTableInputDto[];
}

export interface SourceTableSyncResult {
  // Live terms of the service after the sync: the physical terms of the new version.
  termIds: number[];
  // Logical terms whose attached physicals changed (deleted, renamed, moved, table renamed) and need a history version.
  affectedLogicalIds: number[];
}

interface OwnTerm {
  id: number;
  code: string;
  technical_description: string;
  example_value: string | null;
  source_table_id: number;
  logical_term_id: number | null;
}

// Applies the service's desired source tables and terms inside the write transaction (after the department
// check): updates/creates tables, soft-deletes the service's terms left out, updates and creates the rest.
export async function syncSourceTables(
  manager: EntityManager,
  input: SourceTableSyncInput,
): Promise<SourceTableSyncResult> {
  const { dataServiceId, userId, groups } = input;
  assertSourceTablePayload(groups);

  // Tables this service uses now (they may be left empty below) and the ones in the body are row-locked together
  // in id order first, so emptying + deleting a table cannot race with another service putting a term into it.
  const previous = await queryRows<{ id: number }>(
    manager,
    `SELECT DISTINCT p.source_table_id AS id FROM data_hub_physical_terms p
     WHERE p.data_service_id = $1 AND ${liveSql('p')}`,
    [dataServiceId],
  );
  const previousTableIds = previous.map((r) => Number(r.id));
  const bodyTableIds = groups.filter((g) => g.id !== undefined).map((g) => Number(g.id));
  await lockTables(manager, [...previousTableIds, ...bodyTableIds]);

  const { tableIds, renamedIds } = await resolveTables(manager, input);
  // Logical terms are locked before the physicals, the same order the logical form uses, so the two writers
  // cannot deadlock. A renamed table changes the label of every term in it, whichever service owns them.
  const mapped = await queryRows<{ logical_term_id: number; in_renamed: boolean }>(
    manager,
    `SELECT DISTINCT p.logical_term_id, p.source_table_id = ANY($2::int[]) AS in_renamed
     FROM data_hub_physical_terms p
     WHERE ${liveSql('p')} AND p.logical_term_id IS NOT NULL
       AND (p.data_service_id = $1 OR p.source_table_id = ANY($2::int[]))`,
    [dataServiceId, renamedIds],
  );
  // Logical terms picked in the body are locked in the same pass and must be live.
  const picked = [
    ...new Set(
      groups.flatMap((g) => g.terms.map((t) => t.logical_term_id)).filter((x): x is number => typeof x === 'number'),
    ),
  ];
  const live = await lockLogicalTerms(manager, [
    ...new Set([...mapped.map((m) => Number(m.logical_term_id)), ...picked]),
  ]);
  const badLogical = picked.filter((id) => !live.has(id));
  if (badLogical.length > 0) throw new BadRequestException(`INVALID_LOGICAL_TERMS: ${badLogical.join(', ')}`);
  const affected = new Set(mapped.filter((m) => m.in_renamed).map((m) => Number(m.logical_term_id)));

  const own = await queryRows<OwnTerm>(
    manager,
    `SELECT p.id, p.code, p.technical_description, p.example_value, p.source_table_id, p.logical_term_id
     FROM data_hub_physical_terms p WHERE p.data_service_id = $1 AND ${liveSql('p')} ORDER BY p.id FOR UPDATE`,
    [dataServiceId],
  );
  const ownById = new Map(own.map((t) => [Number(t.id), t]));
  const wanted = groups.flatMap((g, i) =>
    g.terms.map((t) => ({
      ...t,
      example_value: t.example_value ? t.example_value : null,
      source_table_id: tableIds[i],
    })),
  );
  const unknown = wanted.filter((t) => t.id !== undefined && !ownById.has(t.id)).map((t) => t.id);
  if (unknown.length > 0) throw new BadRequestException(`INVALID_PHYSICAL_TERMS: ${unknown.join(', ')}`);
  await assertCodesFree(manager, dataServiceId, wanted);

  const keptIds = new Set(wanted.filter((t) => t.id !== undefined).map((t) => Number(t.id)));
  const removed = own.filter((t) => !keptIds.has(Number(t.id)));
  if (removed.length > 0) {
    await manager.query(
      `UPDATE data_hub_physical_terms SET deleted_at = NOW(), is_deleted = true, updated_by = $2, updated_at = NOW()
       WHERE id = ANY($1)`,
      [removed.map((t) => Number(t.id)), userId],
    );
    removed.forEach((t) => t.logical_term_id !== null && affected.add(Number(t.logical_term_id)));
  }

  // Kept terms paired with their current row; `moved` = code or table changes.
  // `logical` = the mapping after the save (absent in the body keeps the current one).
  const kept = wanted.flatMap((t) => {
    const cur = t.id === undefined ? undefined : ownById.get(t.id);
    if (!cur) return [];
    const current = cur.logical_term_id === null ? null : Number(cur.logical_term_id);
    const logical = t.logical_term_id === undefined ? current : t.logical_term_id;
    const moved = cur.code !== t.code || Number(cur.source_table_id) !== t.source_table_id;
    return [{ t, cur, logical, remapped: logical !== current, moved }];
  });
  const changed = kept.filter(
    ({ t, cur, moved, remapped }) =>
      moved ||
      remapped ||
      cur.technical_description !== t.technical_description ||
      (cur.example_value ?? null) !== t.example_value,
  );
  const moved = changed.filter((c) => c.moved);
  // The per-table code index is checked row by row, so codes being renamed or moved are first parked on an
  // id-based placeholder: swaps between the service's own terms and re-using a freed code then never collide.
  if (moved.length > 0) {
    await manager.query(`UPDATE data_hub_physical_terms SET code = '~moving~' || id WHERE id = ANY($1)`, [
      moved.map((c) => Number(c.cur.id)),
    ]);
  }
  // One statement for every edited term (moved codes are parked above, so no row clashes mid-update).
  if (changed.length > 0) {
    await manager.query(
      `UPDATE data_hub_physical_terms p
       SET code = u.code, technical_description = u.technical_description, example_value = u.example_value,
           source_table_id = u.source_table_id, logical_term_id = u.logical_term_id,
           updated_by = $7, updated_at = NOW()
       FROM UNNEST($1::int[], $2::text[], $3::text[], $4::text[], $5::int[], $6::int[])
         AS u(id, code, technical_description, example_value, source_table_id, logical_term_id)
       WHERE p.id = u.id`,
      [
        changed.map(({ t }) => t.id),
        changed.map(({ t }) => t.code),
        changed.map(({ t }) => t.technical_description),
        changed.map(({ t }) => t.example_value),
        changed.map(({ t }) => t.source_table_id),
        changed.map(({ logical }) => logical),
        userId,
      ],
    );
  }
  // Logical terms whose physicals changed: renamed/moved terms, and both sides of a re-mapping.
  for (const { cur, logical, moved: wasMoved, remapped } of changed) {
    if ((wasMoved || remapped) && cur.logical_term_id !== null) affected.add(Number(cur.logical_term_id));
    if (remapped && logical !== null) affected.add(logical);
  }

  const fresh = wanted.filter((t) => t.id === undefined);
  const newIds = await insertTerms(manager, dataServiceId, userId, fresh);
  fresh.forEach((t) => t.logical_term_id && affected.add(t.logical_term_id));
  let next = 0;
  const termIds = wanted.map((t) => (t.id !== undefined ? t.id : newIds[next++]));
  // Tables still in the body keep at least one term; only the ones the service left can end up empty.
  const bodyTables = new Set(tableIds);
  await deleteEmptyTables(
    manager,
    previousTableIds.filter((id) => !bodyTables.has(id)),
    userId,
  );
  return { termIds, affectedLogicalIds: [...affected] };
}

// Codes are unique inside a source table across every service; this service's own terms being rewritten
// in the same request do not count as taken.
async function assertCodesFree(
  manager: EntityManager,
  dataServiceId: number,
  wanted: Array<{ code: string; source_table_id: number }>,
): Promise<void> {
  if (wanted.length === 0) return;
  const taken = await queryRows<{ code: string; table_name: string }>(
    manager,
    `SELECT p.code, st.name AS table_name FROM data_hub_physical_terms p
     JOIN data_hub_source_tables st ON st.id = p.source_table_id
     JOIN UNNEST($1::int[], $2::text[]) AS w(table_id, code) ON w.table_id = p.source_table_id AND LOWER(p.code) = w.code
     WHERE ${liveSql('p')} AND p.data_service_id <> $3`,
    [wanted.map((t) => t.source_table_id), wanted.map((t) => lower(t.code)), dataServiceId],
  );
  if (taken.length > 0) {
    throw new ConflictException(`PHYSICAL_CODE_EXISTS: ${taken.map((t) => `${t.table_name}.${t.code}`).join(', ')}`);
  }
}
