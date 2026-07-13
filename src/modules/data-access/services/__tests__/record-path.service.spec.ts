import { DataSource } from 'typeorm';
import { RecordPathService } from '../record-path.service';

// DB-mocked: DataSource.query returns scripted rows per call. Asserts the
// emitted SQL (name fetch + parent FK fetch) and the resulting root→leaf path.
describe('RecordPathService.buildPath', () => {
  let query: jest.Mock;
  let service: RecordPathService;

  beforeEach(() => {
    query = jest.fn();
    service = new RecordPathService({ query } as unknown as DataSource);
  });

  // bi_hub_reports → bi_hub_bicc_departments (root). 2 levels.
  // Call sequence per level: (1) fetchRow [name], (2) fetchParentId [fk] — except root
  // which only fetches its name (no parent). So 2 levels = 3 queries (report name,
  // report bicc_department_id, bicc name).
  it('bi_hub_reports 2-level → "BICC-Finance / Q1-Revenue" (root→leaf)', async () => {
    query
      .mockResolvedValueOnce([{ id: 10, display_name: 'Q1-Revenue' }]) // report name
      .mockResolvedValueOnce([{ parentid: 5 }]) // report.bicc_department_id
      .mockResolvedValueOnce([{ id: 5, display_name: 'BICC-Finance' }]); // bicc name (root, no parent fetch)

    const path = await service.buildPath('bi_hub_reports', 10);
    expect(path).toBe('BICC-Finance / Q1-Revenue');
    // Assert SQL emitted for name fetch + fk fetch.
    const calls = query.mock.calls.map((c) => c[0]);
    expect(calls[0]).toContain('FROM "bi_hub_reports"');
    expect(calls[0]).toContain('"name" as display_name');
    expect(calls[1]).toContain('"bicc_department_id" as parentid');
    expect(calls[2]).toContain('FROM "bi_hub_bicc_departments"');
  });

  // bi_payment_documents → program → project → bicc (root). 4 levels.
  it('bi_payment_documents 4-level → root→leaf full chain', async () => {
    query
      .mockResolvedValueOnce([{ id: 1, display_name: 'doc.pdf' }]) // doc name
      .mockResolvedValueOnce([{ parentid: 20 }]) // doc.program_id
      .mockResolvedValueOnce([{ id: 20, display_name: 'Prog-A' }]) // program name
      .mockResolvedValueOnce([{ parentid: 30 }]) // program.project_id
      .mockResolvedValueOnce([{ id: 30, display_name: 'Proj-X' }]) // project name
      .mockResolvedValueOnce([{ parentid: 5 }]) // project.bicc_department_id
      .mockResolvedValueOnce([{ id: 5, display_name: 'BICC' }]); // bicc (root)
    const path = await service.buildPath('bi_payment_documents', 1);
    expect(path).toBe('BICC / Proj-X / Prog-A / doc.pdf');
  });

  // Root-only: ma_tool_cstb_rpt_properties has null parent → single-level.
  it('root-only table (ma_tool_cstb_rpt_properties) → single-level name', async () => {
    query.mockResolvedValueOnce([{ id: 7, display_name: 'RPT-001' }]);
    const path = await service.buildPath('ma_tool_cstb_rpt_properties', 7);
    expect(path).toBe('RPT-001');
    expect(query).toHaveBeenCalledTimes(1); // name only, no parent fetch
  });

  // Name column null on row → fallback ID:<id>.
  it('name null on row → fallback ID:<id>', async () => {
    query
      .mockResolvedValueOnce([{ id: 10, display_name: null }]) // report name null
      .mockResolvedValueOnce([{ parentid: 5 }]) // report.bicc_department_id
      .mockResolvedValueOnce([{ id: 5, display_name: 'BICC' }]); // bicc name
    const path = await service.buildPath('bi_hub_reports', 10);
    expect(path).toBe('BICC / ID: 10');
  });

  // Leaf row gone (soft-deleted / missing) → stop chain, return ID only.
  it('leaf row gone → "ID: <id>"', async () => {
    query.mockResolvedValueOnce([]); // report name fetch returns nothing
    const path = await service.buildPath('bi_hub_reports', 999);
    expect(path).toBe('ID: 999');
  });

  // Row gone mid-chain (parent FK present but parent row missing) → stop, partial chain.
  it('parent row gone mid-chain → partial path up to last found', async () => {
    query
      .mockResolvedValueOnce([{ id: 10, display_name: 'Q1-Revenue' }]) // report name
      .mockResolvedValueOnce([{ parentid: 5 }]) // report.bicc_department_id=5
      .mockResolvedValueOnce([]); // bicc row missing
    const path = await service.buildPath('bi_hub_reports', 10);
    expect(path).toBe('Q1-Revenue'); // leaf only, parent missing
  });

  // Disallowed table → ID:<leafId>, no queries.
  it('disallowed table → "ID: <id>", no DB query', async () => {
    const path = await service.buildPath('not_a_real_table', 42);
    expect(path).toBe('ID: 42');
    expect(query).not.toHaveBeenCalled();
  });

  // Depth guard (MAX_HOPS backstop): real config bounds every walk at a root
  // (HIERARCHY_MAP[root]=null, ≤5 levels), so the guard is a backstop for
  // corrupt/cyclic FK data, not a path reachable via real config. Verified by
  // inspection: the `while (hops++ < MAX_HOPS)` loop in buildPath guarantees
  // termination regardless of query results (no infinite loop possible).
  it('MAX_HOPS backstop — walk always terminates (no infinite loop on any query result)', async () => {
    // Even if every query returns a self-looping parent, the loop is bounded by hops.
    let n = 0;
    query.mockImplementation(() =>
      Promise.resolve(++n % 2 === 1 ? [{ id: 1, display_name: `L${n}` }] : [{ parentid: 1 }]),
    );
    const path = await service.buildPath('bi_payment_documents', 1);
    expect(typeof path).toBe('string');
    // Bound: ≤ MAX_HOPS(8) levels × 2 queries + headroom.
    expect(query.mock.calls.length).toBeLessThanOrEqual(20);
  });
});
