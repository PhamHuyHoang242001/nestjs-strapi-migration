import { LogicalTermQueryService } from '../logical-term-query.service';
import { makeSqlMock, userRefsStub } from './dictionary-test-helpers';

const physicalRow = {
  id: 10,
  logical_term_id: 1,
  code: 'c1',
  technical_description: 't',
  example_value: 'e',
  st_id: 5,
  st_name: 'dw.customer',
  ds_id: 3,
  service_code: 'API-1',
};

describe('LogicalTermQueryService.list', () => {
  const build = () =>
    makeSqlMock([
      [/COUNT\(\*\)::int AS total/, () => [{ total: 2 }]],
      [
        /FROM data_hub_logical_terms lt\s+WHERE .*ORDER BY lt\.created_at DESC, lt\.id DESC/s,
        () => [
          { id: 1, code: 'A', name: 'a', short_description: 'd', example_value: null },
          { id: 2, code: 'B', name: 'b', short_description: 'd', example_value: 'x' },
        ],
      ],
      [
        /WHERE p.logical_term_id = ANY/s,
        () => [
          { ...physicalRow, id: 10, code: 'c1' },
          { ...physicalRow, id: 11, code: 'c2' },
        ],
      ],
      [
        /FROM \(\s*SELECT DISTINCT vpt.physical_term_id/s,
        () => [
          { physical_term_id: 10, consumer_id: 5, consumer_code: 'APP', consumer_name: 'App' },
          { physical_term_id: 11, consumer_id: 5, consumer_code: 'APP', consumer_name: 'App' },
          { physical_term_id: 11, consumer_id: 6, consumer_code: 'PAR', consumer_name: 'Par' },
        ],
      ],
    ]);

  it('batches physicals + systems out per page (4 queries) and never selects *', async () => {
    const { dataSource, calls } = build();
    const service = new LogicalTermQueryService(dataSource as never, userRefsStub as never);
    const res = await service.list({ page: 1, limit: 20 } as never);
    expect(calls).toHaveLength(4);
    for (const c of calls) {
      expect(c.sql).not.toMatch(/SELECT\s+\*/i);
      expect(c.sql).not.toMatch(/\b\w+\.\*/);
    }
    expect(res.meta).toEqual({ total: 2, page: 1, limit: 20 });
    expect(res.data[0].systems_out_count).toBe(2);
    expect(res.data[0].physical_terms[1].systems_out.map((s) => s.code)).toEqual(['APP', 'PAR']);
    expect(res.data[1].physical_terms).toEqual([]);
    expect(res.data[1].systems_out_count).toBe(0);
  });

  it('binds escaped search and consumer filter as parameters', async () => {
    const { dataSource, calls } = build();
    const service = new LogicalTermQueryService(dataSource as never, userRefsStub as never);
    await service.list({ page: 2, limit: 10, keyword: '50%_x', consumer_ids: [5] } as never);
    const params = calls[0].params;
    expect(params).toEqual(['%50\\%\\_x%', [5]]);
    expect(calls[0].sql).not.toContain('50%');
    expect(calls[1].params.slice(-2)).toEqual([10, 10]);
  });

  it('skips child queries when the page is empty', async () => {
    const { dataSource, calls } = makeSqlMock([[/COUNT/, () => [{ total: 0 }]]]);
    const service = new LogicalTermQueryService(dataSource as never, userRefsStub as never);
    const res = await service.list({} as never);
    expect(res.data).toEqual([]);
    expect(calls).toHaveLength(2);
  });
});

describe('LogicalTermQueryService.getById', () => {
  it('404 when missing', async () => {
    const { dataSource } = makeSqlMock([]);
    const service = new LogicalTermQueryService(dataSource as never, userRefsStub as never);
    await expect(service.getById(9)).rejects.toThrow('LOGICAL_TERM_NOT_FOUND');
  });
});

describe('LogicalTermQueryService physicals', () => {
  const rows = [{ id: 1, code: 'A', short_description: 'd', example_value: null }];

  it('tree and detail read live physicals of active live services with their source table and service', async () => {
    const { dataSource, calls } = makeSqlMock([
      [
        /FROM data_hub_logical_terms lt WHERE lt.id = \$1/,
        () => [{ ...rows[0], version_no: 1, created_by: 1, updated_by: null }],
      ],
      [/WHERE p.logical_term_id = ANY/, () => [physicalRow]],
    ]);
    const service = new LogicalTermQueryService(dataSource as never, userRefsStub as never);
    const res = await service.getById(1);
    const physicalSql = calls.find((c) => /WHERE p.logical_term_id = ANY/.test(c.sql))?.sql ?? '';
    expect(physicalSql).toContain("os.status = 'active'");
    expect(physicalSql).toContain('ov.id = os.active_version_id');
    expect(physicalSql).toContain('os.id = p.data_service_id');
    expect(res.physical_terms[0]).toMatchObject({
      code: 'c1',
      source_table: { id: 5, name: 'dw.customer' },
      data_service: { id: 3, service_code: 'API-1' },
    });
  });

  it('systems-out pairs join live physicals (no status any more)', async () => {
    const { dataSource, calls } = makeSqlMock([]);
    const service = new LogicalTermQueryService(dataSource as never, userRefsStub as never);
    await service.systemsOut();
    expect(calls[0].sql).toMatch(
      /JOIN data_hub_physical_terms pt ON pt.id = vpt.physical_term_id AND pt.deleted_at IS NULL/,
    );
    expect(calls[0].sql).not.toContain('pt.status');
  });
});

describe('LogicalTermQueryService.options', () => {
  it('pages live logical terms A→Z with only id, code and short_description', async () => {
    const { dataSource, calls } = makeSqlMock([
      [/COUNT\(\*\)::int AS total/, () => [{ total: 1 }]],
      [/ORDER BY lt.code, lt.id/, () => [{ id: '3', code: 'cif', short_description: 'Mã KH' }]],
    ]);
    const res = await new LogicalTermQueryService(dataSource as never, userRefsStub as never).options({
      keyword: 'ci_',
      page: 1,
      limit: 10,
    } as never);
    expect(res).toEqual({
      data: [{ id: 3, code: 'cif', short_description: 'Mã KH' }],
      meta: { total: 1, page: 1, limit: 10 },
    });
    expect(calls[1].sql).toContain('SELECT lt.id, lt.code, lt.short_description FROM');
    expect(calls[1].params).toEqual(['%ci\\_%', 10, 0]);
  });
});
