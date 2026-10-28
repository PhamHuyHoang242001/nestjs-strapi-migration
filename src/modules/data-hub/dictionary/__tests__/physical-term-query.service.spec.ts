import { PhysicalTermDetailService } from '../physical-term-detail.service';
import { PhysicalTermQueryService } from '../physical-term-query.service';
import { makeSqlMock, userRefsStub } from './dictionary-test-helpers';

describe('PhysicalTermQueryService.available', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 1,
    code: 'cust_nm',
    technical_description: 'd',
    example_value: null,
    logical_id: null,
    logical_code: null,
    st_id: 5,
    st_name: 'dw.customer',
    ds_id: 9,
    service_code: 'API-1',
    service_name: 'Svc',
    ...over,
  });
  const build = () =>
    makeSqlMock([
      [/COUNT\(\*\)::int AS total/, () => [{ total: 1 }]],
      [/ORDER BY st\.name, p\.code/, () => [row()]],
    ]);

  it('lists unmapped terms of active live services, naming their source table and service', async () => {
    const { dataSource, calls } = build();
    const res = await new PhysicalTermQueryService(dataSource as never).available({ page: 1, limit: 10 } as never);
    expect(res.data[0]).toEqual({
      id: 1,
      code: 'cust_nm',
      technical_description: 'd',
      example_value: null,
      logical_term: null,
      source_table: { id: 5, name: 'dw.customer' },
      data_service: { id: 9, service_code: 'API-1', name: 'Svc' },
    });
    expect(calls[0].sql).toContain('p.logical_term_id IS NULL');
    expect(calls[0].sql).toContain('os.id = p.data_service_id');
    // terms of inactive / deleted services (or without a live active version) are hidden
    expect(calls[0].sql).toContain("os.status = 'active'");
    expect(calls[0].sql).toContain('ov.id = os.active_version_id');
  });

  it('keeps terms already on the edited logical term and searches code, table and service', async () => {
    const { dataSource, calls } = build();
    await new PhysicalTermQueryService(dataSource as never).available({
      keyword: 'a_',
      logical_term_id: 7,
      page: 1,
      limit: 10,
    } as never);
    expect(calls[0].params).toEqual(['%a\\_%', 7]);
    expect(calls[0].sql).toContain('p.logical_term_id IS NULL OR p.logical_term_id = $2');
    expect(calls[0].sql).toContain('st.name ILIKE $1');
  });
});

describe('PhysicalTermDetailService.getById', () => {
  it('returns the term with its source table, owning service and the service consumers', async () => {
    const { dataSource } = makeSqlMock([
      [
        /WHERE p\.id = \$1/,
        () => [
          {
            id: 1,
            code: 'cust_nm',
            technical_description: 'd',
            example_value: 'e',
            logical_id: 7,
            logical_code: 'CUST',
            logical_short_description: 'short',
            st_id: 5,
            st_name: 'dw.customer',
            st_description: null,
            ds_id: 3,
            service_code: 'API-1',
            service_type: 'API',
            service_status: 'active',
            service_name: 'Svc',
            created_by: 1,
            updated_by: null,
            created_at: 't',
            updated_at: 't',
          },
        ],
      ],
      [/SELECT DISTINCT c\.id/, () => [{ id: 9, code: 'APP', name: 'App' }]],
    ]);
    const res = await new PhysicalTermDetailService(dataSource as never, userRefsStub as never).getById(1);
    expect(res).toMatchObject({
      code: 'cust_nm',
      logical_term: { id: 7, code: 'CUST', short_description: 'short' },
      source_table: { id: 5, name: 'dw.customer', description: null },
      data_service: { id: 3, service_code: 'API-1', service_type: 'API', status: 'active', name: 'Svc' },
      systems_out: [{ id: 9, code: 'APP', name: 'App' }],
    });
    expect(res).not.toHaveProperty('status');
  });

  it('404 when the term or its service is not live', async () => {
    const { dataSource } = makeSqlMock([]);
    await expect(new PhysicalTermDetailService(dataSource as never, userRefsStub as never).getById(1)).rejects.toThrow(
      'PHYSICAL_TERM_NOT_FOUND',
    );
  });
});
