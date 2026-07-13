import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ALLOWED_TABLES, HIERARCHY_MAP, getNameColumn } from '../constants/hierarchy-config';

// Max hierarchy hops before giving up — guards against cycles or malformed FK
// chains. Real trees here are ≤5 levels deep; 8 leaves headroom.
const MAX_HOPS = 8;

// Builds a root→leaf display path for a data-access record by walking
// HIERARCHY_MAP from the leaf (tableName, id) up to its root, fetching each
// level's display name via NAME_COLUMN_MAP (fallback 'ID: <id>' when the
// column is null or the row is gone). Joins with ' / '.
//
// Reuses the existing hierarchy config — no new table map. Used by the
// data-access list + details endpoints to render a full breadcrumb (e.g.
// "BICC-Finance / Q1-Revenue") alongside the existing module_path.
@Injectable()
export class RecordPathService {
  constructor(private readonly connection: DataSource) {}

  async buildPath(tableName: string, leafId: number): Promise<string> {
    if (!tableName || !ALLOWED_TABLES.has(tableName)) {
      return `ID: ${leafId}`;
    }

    // Collect leaf→root; reverse at the end for root→leaf.
    const chain: string[] = [];
    let curTable: string | null = tableName;
    let curId = leafId;
    let hops = 0;

    while (curTable && ALLOWED_TABLES.has(curTable) && hops++ < MAX_HOPS) {
      const nameCol = getNameColumn(curTable);
      const row = await this.fetchRow(curTable, curId, nameCol);
      if (!row) break; // row gone (soft-deleted / missing) → stop chain
      const name = (row.display_name != null && String(row.display_name).trim()) || `ID: ${curId}`;
      chain.push(name);

      const entry = HIERARCHY_MAP[curTable];
      if (!entry) break; // root reached (null parent)
      const parentId = await this.fetchParentId(curTable, curId, entry.fkColumn);
      if (parentId == null) break; // FK null → cannot walk further
      curTable = entry.parentTable;
      curId = parentId;
    }

    if (!chain.length) return `ID: ${leafId}`;
    return chain.reverse().join(' / ');
  }

  private async fetchRow(table: string, id: number, nameCol: string): Promise<{ display_name: unknown } | null> {
    const rows: { display_name: unknown }[] = await this.connection.query(
      `SELECT id, "${nameCol}" as display_name FROM "${table}" WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ?? null;
  }

  private async fetchParentId(table: string, id: number, fkColumn: string): Promise<number | null> {
    // Postgres lowercases unquoted aliases → 'parentid'. Match the driver's shape.
    const rows: { parentid: number | null }[] = await this.connection.query(
      `SELECT "${fkColumn}" as parentid FROM "${table}" WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0]?.parentid ?? null;
  }
}
