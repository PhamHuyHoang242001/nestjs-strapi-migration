# Brainstorm — Data-access list: record path (tree-joined names)

## Problem
`GET /v1/data-access/list` (+ `details/:id`) trả `module_path` (text từ `modules.path`) + `record_name` (tên record lá qua `NAME_COLUMN_MAP`). Thiếu **path nối cây** dạng `bicc-name/report-name` (root→leaf, `/`-separated) để UI hiển thị breadcrumb đầy đủ của record mục tiêu.

## Requirements (locked via AskUserQuestion)
- **Path shape**: root→leaf, `/`-separated. VD bi_hub_reports → `BICC-Finance / Q1-Revenue`.
- **Endpoints**: `list` + `details/:id`.
- **Name missing**: `NAME_COLUMN_MAP[table]` → nếu column null/row ko tồn tại → fallback `ID: <id>` (nhất quán với `record_name` hiện tại).
- **Root level**: BAO GỒM root (bicc_department / workspace).
- **Approach**: A — app walk `HIERARCHY_MAP` lên parent, per-record. Reuse `NAME_COLUMN_MAP` + `getNameColumn()`.
- **list batching**: per-record walk (KISS). List paginate ≤50 × depth ≤5 = ~250 query — chấp nhận cho admin UI.

## Existing assets (reuse 100%)
- `HIERARCHY_MAP` (hierarchy-config.ts:12) — parent→child tree: `bi_hub_reports.bicc_department_id → bi_hub_bicc_departments` (root); `bi_payment_documents.program_id → bi_payment_programs.project_id → bi_payment_projects.bicc_department_id → bi_hub_bicc_departments`. Max depth ~5.
- `NAME_COLUMN_MAP` (line 70) + `getNameColumn()` (line 134) — table→display column, fallback `id` + regex guard.
- `ALLOWED_TABLES` (line 47) — whitelist guard.
- `DataSource` (connection) — đã inject trong `DataAccessService`.
- `batchFetchRecordNames` (service:339) — pattern fetch name lá; path service mirror cách query.

## Design

### New: `RecordPathService` (services/record-path.service.ts, <120 dòng)
```ts
@Injectable()
export class RecordPathService {
  constructor(private readonly connection: DataSource) {}

  // Return root→leaf path, e.g. "BICC-Finance / Q1-Revenue".
  // Walks HIERARCHY_MAP from tableName/leafId up to root, collecting
  // {table, id, name} per level, then reverses + joins with ' / '.
  async buildPath(tableName: string, leafId: number): Promise<string> {
    const chain: { table: string; id: number; name: string }[] = [];
    let curTable = tableName;
    let curId = leafId;
    let guard = 0; // cycle/depth guard (max 8 hops)
    while (curTable && ALLOWED_TABLES.has(curTable) && guard++ < 8) {
      const nameCol = getNameColumn(curTable);
      const row = await this.fetchRow(curTable, curId, nameCol);
      if (!row) break; // row gone → stop chain (fallback applied at join)
      const name = (row.display_name && String(row.display_name).trim()) || `ID: ${curId}`;
      chain.push({ table: curTable, id: curId, name });
      const entry = HIERARCHY_MAP[curTable];
      if (!entry) break; // root
      const parentRow = await this.fetchParent(curTable, curId, entry.fkColumn, entry.parentTable);
      if (!parentRow) break;
      curTable = entry.parentTable;
      curId = parentRow.parentId;
    }
    return chain.reverse().map((c) => c.name).join(' / ');
  }

  private async fetchRow(table, id, nameCol) {
    return this.connection.query(
      `SELECT id, "${nameCol}" as display_name FROM "${table}" WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    ).then((r: any[]) => r[0] || null);
  }
  private async fetchParent(table, id, fkCol, parentTable) {
    // FK may be on the child row (bi_payment_documents.program_id) → query child FK
    // OR the relation is a link/junction. Here HIERARCHY_MAP fkColumn is the
    // child's column pointing to parent.id.
    const r: any[] = await this.connection.query(
      `SELECT "${fkCol}" as parentId FROM "${table}" WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    const parentId = r[0]?.parentId;
    if (!parentId) return null;
    return { parentId };
  }
}
```

**Note**: `HIERARCHY_MAP` `fkColumn` = child's column pointing to parent (e.g. `bi_payment_programs.project_id`). Walk = read child.fkColumn → jump to parent. ✓ matches all entries.

### Wire into `DataAccessService`
- Inject `RecordPathService`.
- `list`: after `batchFetchRecordNames`, build path per group:
  ```ts
  const paths = await Promise.all(groups.map((g) =>
    this.recordPath.buildPath(g.table_name, g.data_id).catch(() => `ID: ${g.data_id}`),
  ));
  // attach record_path: paths[i] to each group in `data`.
  ```
  Response: thêm field `record_path` (giữ nguyên `module_path` + `record_name` — backward compat).
- `details`: `record_path = await this.recordPath.buildPath(tableName, record.data_id)`. Return `{ ...record, record_info, record_path }`.

### Response shape (additive — no breaking change)
```json
{
  "data": [{
    "data_id": 12, "module_id": 5, "module_name": "...", "module_path": "bicc/report",
    "record_name": "Q1-Revenue",
    "record_path": "BICC-Finance / Q1-Revenue",   // NEW
    "table_name": "bi_hub_reports", "rules": [...]
  }]
}
```

## Edge cases
- **Root whole-table SO** (`ma_tool_cstb_rpt_properties`, `HIERARCHY_MAP=null`): path = single-level name (no parent). ✓ `chain` has 1 entry.
- **Cycle/malformed FK**: depth guard `guard < 8` stops infinite loop → returns partial path.
- **Row soft-deleted mid-chain**: `fetchRow` returns null → chain stops; fallback `ID:` for that level onward skipped. Acceptable (display-only).
- **`bi_payment_categories`** (root, no parent): single-level path. ✓
- **`bi_payment_project_histories`** (NAME_COLUMN_MAP = `id`): `getNameColumn` returns `id` → name = `ID: <id>` (column is id). ✓ regex guard allows `id`.
- **list N+1**: per-record × depth query. List ≤50 × ≤5 ≈ 250 queries. Acceptable for admin UI (low volume). Flag as perf follow-up if needed.

## Risks
- **FK semantics**: `HIERARCHY_MAP.fkColumn` assumed = child→parent column. Verify `bi_payment_other_files.bi_payment_checklist_id` (child=other_file, parent=checklist) — YES, fkColumn is child's. ✓ Walk direction correct.
- **Perf in list**: 250 queries worst-case. Monitor; switch to Approach-batch (batch per-level) if list becomes slow.
- **Name null on row**: `row.display_name` null → `ID: <id>` fallback (per locked decision). ✓

## Files
- NEW `src/modules/data-access/services/record-path.service.ts` (<120 dòng)
- NEW `src/modules/data-access/services/__tests__/record-path.service.spec.ts` (DB-mocked; assert path shape root→leaf, fallback, depth guard)
- MOD `data-access.service.ts` — inject service; `list` + `details` attach `record_path`
- MOD `data-access.module.ts` — register `RecordPathService` provider + export

## Success criteria
- list response có `record_path` = root→leaf `/`-separated cho mỗi group.
- details response có `record_path`.
- Path dùng `NAME_COLUMN_MAP`; null→`ID: <id>`.
- Bao gồm root level.
- Tests: path cho bi_hub_reports (2 cấp), bi_payment_documents (4 cấp: doc→program→project→bicc), root-only table (1 cấp), row-deleted (partial + fallback).
- No regression: existing data-access tests pass; `module_path` + `record_name` unchanged.

## Out of scope
- by-user / by-role endpoints (chỉ list + details theo locked decision).
- Batch-per-level optimization (per-record walk đã chốt KISS).
- Materialized cache column.
- Frontend changes.

## Next steps
- `/ck:plan` (default) → implement RecordPathService + wire list/details + tests.
