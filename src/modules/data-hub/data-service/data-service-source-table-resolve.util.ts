import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { liveSql } from '../common/data-hub-query.util';
import { sourceTableScopeSql } from '../common/source-table-groups.util';
import { queryRows } from './data-service-query-rows.util';
import { lower } from './data-service-source-table-payload.util';
import type { SourceTableSyncInput } from './data-service-source-tables.util';

// Usable tables: see sourceTableScopeSql ($2 = the caller's departments, $3 = the service).
const SCOPE_SQL = sourceTableScopeSql('$2::int[]', '$3::int');

// One id per group: existing tables are checked (live, usable by this service) and updated; new ones created.
// `renamedIds` are the existing tables whose name changed.
export async function resolveTables(
  manager: EntityManager,
  input: SourceTableSyncInput,
): Promise<{ tableIds: number[]; renamedIds: number[] }> {
  const { dataServiceId, departmentId, scopeDepartmentIds, userId, groups } = input;
  const existingIds = groups.filter((g) => g.id !== undefined).map((g) => Number(g.id));
  const renamedIds: number[] = [];
  if (existingIds.length > 0) {
    const rows = await queryRows<{ id: number; name: string; description: string | null; usable: boolean }>(
      manager,
      `SELECT st.id, st.name, st.description, ${SCOPE_SQL} AS usable
       FROM data_hub_source_tables st WHERE st.id = ANY($1) AND ${liveSql('st')} ORDER BY st.id FOR UPDATE`,
      [existingIds, scopeDepartmentIds, dataServiceId],
    );
    const found = new Map(rows.map((r) => [Number(r.id), r]));
    const missing = existingIds.filter((id) => !found.has(id));
    if (missing.length > 0) throw new BadRequestException(`INVALID_SOURCE_TABLES: ${missing.join(', ')}`);
    const forbidden = rows.filter((r) => !r.usable).map((r) => r.name);
    if (forbidden.length > 0) throw new ForbiddenException(`SOURCE_TABLE_FORBIDDEN: ${forbidden.join(', ')}`);
    for (const g of groups.filter((x) => x.id !== undefined)) {
      const cur = found.get(Number(g.id)) as { name: string; description: string | null };
      const description = g.description ? g.description : null;
      if (cur.name === g.name && (cur.description ?? null) === description) continue;
      if (cur.name !== g.name) {
        await assertNameFree(manager, g.name, Number(g.id));
        renamedIds.push(Number(g.id));
      }
      await manager.query(
        `UPDATE data_hub_source_tables SET name = $2, description = $3, updated_by = $4, updated_at = NOW()
         WHERE id = $1`,
        [g.id, g.name, description, userId],
      );
    }
  }
  const tableIds: number[] = [];
  for (const g of groups) {
    if (g.id !== undefined) {
      tableIds.push(Number(g.id));
      continue;
    }
    await assertNameFree(manager, g.name, null);
    const [row] = await queryRows<{ id: number }>(
      manager,
      `INSERT INTO data_hub_source_tables (name, description, department_id, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [g.name, g.description ? g.description : null, departmentId, userId],
    );
    tableIds.push(Number(row.id));
  }
  return { tableIds, renamedIds };
}

async function assertNameFree(manager: EntityManager, name: string, exceptId: number | null): Promise<void> {
  const rows = await queryRows<{ id: number }>(
    manager,
    `SELECT st.id FROM data_hub_source_tables st
     WHERE ${liveSql('st')} AND LOWER(st.name) = $1 AND ($2::int IS NULL OR st.id <> $2)`,
    [lower(name), exceptId],
  );
  if (rows.length > 0) throw new ConflictException(`SOURCE_TABLE_NAME_EXISTS: ${name}`);
}

export async function lockTables(manager: EntityManager, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await manager.query(
    `SELECT st.id FROM data_hub_source_tables st WHERE st.id = ANY($1) AND ${liveSql('st')} ORDER BY st.id FOR UPDATE`,
    [[...new Set(ids)]],
  );
}

// A table no live term points to any more (from any service, active or not) is deleted with them: a deleted
// table no longer exists, so its name is free again.
export async function deleteEmptyTables(manager: EntityManager, ids: number[], userId: number): Promise<void> {
  if (ids.length === 0) return;
  await manager.query(
    `UPDATE data_hub_source_tables st SET deleted_at = NOW(), is_deleted = true, updated_by = $2, updated_at = NOW()
     WHERE st.id = ANY($1) AND ${liveSql('st')}
       AND NOT EXISTS (SELECT 1 FROM data_hub_physical_terms p WHERE p.source_table_id = st.id AND ${liveSql('p')})`,
    [ids, userId],
  );
}
