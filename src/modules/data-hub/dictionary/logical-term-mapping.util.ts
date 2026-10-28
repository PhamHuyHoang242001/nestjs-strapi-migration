import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { liveSql } from '../common/data-hub-query.util';
import { termOfActiveServiceSql } from '../common/source-table-groups.util';

// A physical term as the logical form sees it; `label` is `source table.code` (codes repeat across tables).
export interface LockedPhysical {
  id: number;
  label: string;
  logical_term_id: number | null;
}

// Row-lock live logical terms in id order (stable order avoids deadlocks); returns the ids that exist.
export async function lockLogicalTerms(manager: EntityManager, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows: Array<{ id: number }> = await manager.query(
    `SELECT lt.id FROM data_hub_logical_terms lt
     WHERE lt.id = ANY($1) AND ${liveSql('lt')}
     ORDER BY lt.id FOR UPDATE`,
    [ids],
  );
  return new Set(rows.map((r) => Number(r.id)));
}

// Row-lock live physical terms of live services by id so concurrent mapping changes cannot interleave.
export async function lockPhysicalTermsById(manager: EntityManager, ids: number[]): Promise<LockedPhysical[]> {
  if (ids.length === 0) return [];
  const rows: Array<{ id: number; label: string; logical_term_id: number | null }> = await manager.query(
    `SELECT p.id, st.name || '.' || p.code AS label, p.logical_term_id
     FROM data_hub_physical_terms p JOIN data_hub_source_tables st ON st.id = p.source_table_id
     WHERE p.id = ANY($1) AND ${termOfActiveServiceSql('p')}
     ORDER BY p.id FOR UPDATE OF p`,
    [ids],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    label: r.label,
    logical_term_id: r.logical_term_id === null ? null : Number(r.logical_term_id),
  }));
}

// A physical may only be attached to a term when it is free or already belongs to that same term.
export function assertMappable(physicals: LockedPhysical[], targetLogicalId: number | null): void {
  const blocked = physicals.filter((p) => p.logical_term_id !== null && p.logical_term_id !== targetLogicalId);
  if (blocked.length > 0) {
    throw new BadRequestException(`PHYSICAL_ALREADY_MAPPED: ${blocked.map((p) => p.label).join(', ')}`);
  }
}

// Point the given physicals at a logical term (or detach with null).
export async function setPhysicalMapping(
  manager: EntityManager,
  physicalIds: number[],
  logicalTermId: number | null,
  userId: number,
): Promise<void> {
  if (physicalIds.length === 0) return;
  await manager.query(
    `UPDATE data_hub_physical_terms SET logical_term_id = $2, updated_by = $3, updated_at = NOW()
     WHERE id = ANY($1)`,
    [physicalIds, logicalTermId, userId],
  );
}

export { returningRows } from '../common/data-hub-query.util';
