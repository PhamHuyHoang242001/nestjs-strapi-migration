import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ALLOWED_TABLES, HIERARCHY_MAP, getNameColumn } from '../constants/hierarchy-config';

const MAX_HOPS = 8;

export type RecordPathLeaf = { tableName: string; id: number };

type CachedRow = { display_name: unknown; parentid: number | null };

@Injectable()
export class RecordPathService {
  constructor(private readonly connection: DataSource) {}

  async buildPath(tableName: string, leafId: number): Promise<string> {
    const map = await this.buildPaths([{ tableName, id: leafId }]);
    return map.get(this.pathKey(tableName, leafId)) ?? `ID: ${leafId}`;
  }

  /**
   * Batch root→leaf paths. Groups ids per table so each hop is one
   * `id = ANY($1)` query (name + parent FK together), not N per-record queries.
   */
  async buildPaths(leaves: RecordPathLeaf[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (!leaves.length) return result;

    const cache = new Map<string, CachedRow>();
    let pending = this.groupAllowedIds(leaves);
    let hops = 0;

    while (pending.size && hops++ < MAX_HOPS) {
      const next = new Map<string, Set<number>>();
      for (const [table, ids] of pending) {
        const rows = await this.fetchRows(table, [...ids]);
        const entry = HIERARCHY_MAP[table];
        for (const id of ids) {
          const row = rows.get(id);
          if (!row) continue;
          cache.set(this.pathKey(table, id), row);
          if (!entry || row.parentid == null) continue;
          const parentKey = this.pathKey(entry.parentTable, row.parentid);
          if (cache.has(parentKey)) continue;
          const set = next.get(entry.parentTable) ?? new Set<number>();
          set.add(row.parentid);
          next.set(entry.parentTable, set);
        }
      }
      pending = next;
    }

    for (const leaf of leaves) {
      result.set(this.pathKey(leaf.tableName, leaf.id), this.walkPath(leaf.tableName, leaf.id, cache));
    }
    return result;
  }

  private pathKey(tableName: string, id: number): string {
    return `${tableName}:${id}`;
  }

  private groupAllowedIds(leaves: RecordPathLeaf[]): Map<string, Set<number>> {
    const grouped = new Map<string, Set<number>>();
    for (const leaf of leaves) {
      if (!leaf.tableName || !ALLOWED_TABLES.has(leaf.tableName)) continue;
      const set = grouped.get(leaf.tableName) ?? new Set<number>();
      set.add(leaf.id);
      grouped.set(leaf.tableName, set);
    }
    return grouped;
  }

  private walkPath(tableName: string, leafId: number, cache: Map<string, CachedRow>): string {
    if (!tableName || !ALLOWED_TABLES.has(tableName)) return `ID: ${leafId}`;

    const chain: string[] = [];
    let curTable: string | null = tableName;
    let curId = leafId;
    let hops = 0;

    while (curTable && ALLOWED_TABLES.has(curTable) && hops++ < MAX_HOPS) {
      const row = cache.get(this.pathKey(curTable, curId));
      if (!row) break;
      const name = (row.display_name != null && String(row.display_name).trim()) || `ID: ${curId}`;
      chain.push(name);
      const entry = HIERARCHY_MAP[curTable];
      if (!entry || row.parentid == null) break;
      curTable = entry.parentTable;
      curId = row.parentid;
    }

    if (!chain.length) return `ID: ${leafId}`;
    return chain.reverse().join(' / ');
  }

  private async fetchRows(table: string, ids: number[]): Promise<Map<number, CachedRow>> {
    const map = new Map<number, CachedRow>();
    if (!ids.length || !ALLOWED_TABLES.has(table)) return map;
    const nameCol = getNameColumn(table);
    if (!/^[a-z_]+$/.test(nameCol)) return map;

    const entry = HIERARCHY_MAP[table];
    const fkSelect =
      entry && /^[a-z_]+$/.test(entry.fkColumn) ? `, "${entry.fkColumn}" as parentid` : '';

    try {
      const rows: { id: number; display_name: unknown; parentid?: number | null }[] =
        await this.connection.query(
          `SELECT id, "${nameCol}" as display_name${fkSelect} FROM "${table}" WHERE id = ANY($1) AND deleted_at IS NULL AND is_deleted IS NOT TRUE`,
          [ids],
        );
      for (const row of rows) {
        map.set(Number(row.id), {
          display_name: row.display_name,
          parentid: row.parentid == null ? null : Number(row.parentid),
        });
      }
    } catch {
      // Per-table failure must not fail the whole list.
    }
    return map;
  }
}
