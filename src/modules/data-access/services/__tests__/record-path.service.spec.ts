import { DataSource } from 'typeorm';
import { RecordPathService } from '../record-path.service';

describe('RecordPathService.buildPath', () => {
  let query: jest.Mock;
  let service: RecordPathService;

  beforeEach(() => {
    query = jest.fn();
    service = new RecordPathService({ query } as unknown as DataSource);
  });

  it('bi_hub_reports 2-level → "BICC-Finance / Q1-Revenue" (root→leaf)', async () => {
    query
      .mockResolvedValueOnce([{ id: 10, display_name: 'Q1-Revenue', parentid: 5 }])
      .mockResolvedValueOnce([{ id: 5, display_name: 'BICC-Finance' }]);

    const path = await service.buildPath('bi_hub_reports', 10);
    expect(path).toBe('BICC-Finance / Q1-Revenue');
    const calls = query.mock.calls.map((c) => c[0]);
    expect(calls[0]).toContain('FROM "bi_hub_reports"');
    expect(calls[0]).toContain('"name" as display_name');
    expect(calls[0]).toContain('"bicc_department_id" as parentid');
    expect(calls[0]).toContain('id = ANY($1)');
    expect(calls[1]).toContain('FROM "bi_hub_bicc_departments"');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('bi_payment_documents 4-level → root→leaf full chain', async () => {
    query
      .mockResolvedValueOnce([{ id: 1, display_name: 'doc.pdf', parentid: 20 }])
      .mockResolvedValueOnce([{ id: 20, display_name: 'Prog-A', parentid: 30 }])
      .mockResolvedValueOnce([{ id: 30, display_name: 'Proj-X', parentid: 5 }])
      .mockResolvedValueOnce([{ id: 5, display_name: 'BICC' }]);
    const path = await service.buildPath('bi_payment_documents', 1);
    expect(path).toBe('BICC / Proj-X / Prog-A / doc.pdf');
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('root-only table (ma_tool_cstb_rpt_properties) → single-level name', async () => {
    query.mockResolvedValueOnce([{ id: 7, display_name: 'RPT-001' }]);
    const path = await service.buildPath('ma_tool_cstb_rpt_properties', 7);
    expect(path).toBe('RPT-001');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('name null on row → fallback ID:<id>', async () => {
    query
      .mockResolvedValueOnce([{ id: 10, display_name: null, parentid: 5 }])
      .mockResolvedValueOnce([{ id: 5, display_name: 'BICC' }]);
    const path = await service.buildPath('bi_hub_reports', 10);
    expect(path).toBe('BICC / ID: 10');
  });

  it('leaf row gone → "ID: <id>"', async () => {
    query.mockResolvedValueOnce([]);
    const path = await service.buildPath('bi_hub_reports', 999);
    expect(path).toBe('ID: 999');
  });

  it('parent row gone mid-chain → partial path up to last found', async () => {
    query
      .mockResolvedValueOnce([{ id: 10, display_name: 'Q1-Revenue', parentid: 5 }])
      .mockResolvedValueOnce([]);
    const path = await service.buildPath('bi_hub_reports', 10);
    expect(path).toBe('Q1-Revenue');
  });

  it('disallowed table → "ID: <id>", no DB query', async () => {
    const path = await service.buildPath('not_a_real_table', 42);
    expect(path).toBe('ID: 42');
    expect(query).not.toHaveBeenCalled();
  });

  it('MAX_HOPS backstop — walk always terminates (no infinite loop on any query result)', async () => {
    query.mockResolvedValue([{ id: 1, display_name: 'L', parentid: 1 }]);
    const path = await service.buildPath('bi_payment_documents', 1);
    expect(typeof path).toBe('string');
    expect(query.mock.calls.length).toBeLessThanOrEqual(20);
  });
});

describe('RecordPathService.buildPaths', () => {
  let query: jest.Mock;
  let service: RecordPathService;

  beforeEach(() => {
    query = jest.fn();
    service = new RecordPathService({ query } as unknown as DataSource);
  });

  it('batches same-table leaves into one query per hop', async () => {
    query
      .mockResolvedValueOnce([
        { id: 10, display_name: 'R1', parentid: 5 },
        { id: 11, display_name: 'R2', parentid: 5 },
      ])
      .mockResolvedValueOnce([{ id: 5, display_name: 'BICC' }]);

    const map = await service.buildPaths([
      { tableName: 'bi_hub_reports', id: 10 },
      { tableName: 'bi_hub_reports', id: 11 },
    ]);

    expect(map.get('bi_hub_reports:10')).toBe('BICC / R1');
    expect(map.get('bi_hub_reports:11')).toBe('BICC / R2');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][1][0]).toEqual(expect.arrayContaining([10, 11]));
    expect(query.mock.calls[1][1][0]).toEqual([5]);
  });
});
