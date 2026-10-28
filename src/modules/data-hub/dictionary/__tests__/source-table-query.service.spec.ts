import { DataHubConsumerTermsQueryService } from '../../consumer/data-hub-consumer-terms-query.service';
import { SourceTableQueryService } from '../source-table-query.service';
import { makeSqlMock } from './dictionary-test-helpers';

const group = { id: 5, name: 'dw.t', description: null, term_count: 2 };
const access = { sourceTableDepartmentIds: jest.fn().mockResolvedValue([2, 4]) };
const termRow = {
  id: 1,
  code: 'cust_id',
  technical_description: 'd',
  example_value: null,
  logical_id: null,
  logical_code: null,
  ds_id: 3,
  service_code: 'API-1',
  service_name: 'Svc',
};

describe('SourceTableQueryService (dictionary)', () => {
  it('pages tables holding terms of live services, newest first, with their departments, divisions and nested terms', async () => {
    const { dataSource, calls } = makeSqlMock([
      [/COUNT\(\*\)::int AS total/, () => [{ total: 1 }]],
      [/SELECT st.id, st.name, st.description, tc.term_count/, () => [group]],
      [/SELECT DISTINCT x.st_id/, () => [{ st_id: 5, id: 1, code: 'DPD', name: 'DPD' }]],
      [/JOIN data_hub_divisions d/, () => [{ st_id: 5, id: 9, code: 'KHCN', name: 'Khối KHCN' }]],
      [/WHERE p.source_table_id = ANY\(\$1::int\[\]\)/, () => [{ ...termRow, source_table_id: 5 }]],
    ]);
    const res = await new SourceTableQueryService(dataSource as never, access as never).list({
      page: 1,
      limit: 10,
    } as never);
    expect(res).toEqual({
      data: [
        {
          ...group,
          departments: [{ id: 1, code: 'DPD', name: 'DPD' }],
          divisions: [{ id: 9, code: 'KHCN', name: 'Khối KHCN' }],
          physical_terms: [
            {
              id: 1,
              code: 'cust_id',
              technical_description: 'd',
              example_value: null,
              logical_term: null,
              data_service: { id: 3, service_code: 'API-1', name: 'Svc' },
            },
          ],
        },
      ],
      meta: { total: 1, page: 1, limit: 10 },
    });
    expect(calls[1].sql).toContain('ORDER BY st.created_at DESC, st.id DESC');
    expect(calls[1].sql).toContain('os.id = p.data_service_id');
    // one batched query for the terms of the whole page
    expect(calls[3].params).toEqual([[5]]);
  });

  it('terms of a table carry their service; 404 for a missing table', async () => {
    const ok = makeSqlMock([
      [/SELECT 1 FROM data_hub_source_tables/, () => [{}]],
      [/WHERE p.source_table_id = ANY/, () => [{ ...termRow, source_table_id: 5 }]],
    ]);
    const res = await new SourceTableQueryService(ok.dataSource as never, access as never).terms(5);
    expect(res.data[0]).toEqual({
      id: 1,
      code: 'cust_id',
      technical_description: 'd',
      example_value: null,
      logical_term: null,
      data_service: { id: 3, service_code: 'API-1', name: 'Svc' },
    });
    const missing = makeSqlMock([]);
    await expect(new SourceTableQueryService(missing.dataSource as never, access as never).terms(5)).rejects.toThrow(
      'SOURCE_TABLE_NOT_FOUND',
    );
  });

  it("selectable lists the caller's departments' tables without a chosen department, with their departments", async () => {
    const { dataSource, calls } = makeSqlMock([
      [/COUNT\(\*\)::int AS total/, () => [{ total: 1 }]],
      [/ORDER BY st.name, st.id/, () => [group]],
      [/SELECT DISTINCT x.st_id/, () => [{ st_id: 5, id: 2, code: 'C360', name: 'C360' }]],
    ]);
    const caller = { id: 7 };
    const res = await new SourceTableQueryService(dataSource as never, access as never).selectable(
      caller as never,
      { keyword: 'dw', page: 1, limit: 10 } as never,
    );
    expect(access.sourceTableDepartmentIds).toHaveBeenCalledWith(caller);
    expect(calls[0].params).toEqual([[2, 4], null, '%dw%']);
    expect(calls[0].sql).toContain('st.department_id = ANY($1::int[])');
    expect(calls[0].sql).toContain('sp.data_service_id = $2::int');
    expect(calls[0].sql).toContain('st.name ILIKE $3');
    expect(res.data).toEqual([{ ...group, departments: [{ id: 2, code: 'C360', name: 'C360' }], divisions: [] }]);
  });

  it('filters tables by department (creating or active-version) and division of active versions', async () => {
    const { dataSource, calls } = makeSqlMock([[/COUNT\(\*\)::int AS total/, () => [{ total: 0 }]]]);
    await new SourceTableQueryService(dataSource as never, access as never).list({
      keyword: 'dw',
      department_ids: [1, 2],
      division_ids: [9],
      page: 1,
      limit: 10,
    } as never);
    const [count, page] = calls;
    expect(count.params).toEqual(['%dw%', [1, 2], [9]]);
    expect(count.sql).toContain('st.department_id = ANY($2::int[])');
    expect(count.sql).toContain('fv.department_id = ANY($2::int[])');
    expect(count.sql).toContain('fv.division_id = ANY($3::int[])');
    expect(page.params).toEqual(['%dw%', [1, 2], [9], 10, 0]);
    expect(page.sql).toContain('LIMIT $4 OFFSET $5');
  });
});

describe('DataHubConsumerTermsQueryService', () => {
  it('scopes terms to the active versions of active services serving the consumer', async () => {
    const { dataSource, calls } = makeSqlMock([
      [/SELECT 1 FROM data_hub_consumers/, () => [{}]],
      [/COUNT\(\*\)::int AS total/, () => [{ total: 1 }]],
      [/tc.term_count/, () => [group]],
      [/WHERE p.source_table_id = ANY\(\$2::int\[\]\)/, () => [{ ...termRow, source_table_id: 5 }]],
    ]);
    const res = await new DataHubConsumerTermsQueryService(dataSource as never).sourceTables(4, {} as never);
    expect(res.data).toEqual([
      {
        ...group,
        physical_terms: [
          {
            id: 1,
            code: 'cust_id',
            technical_description: 'd',
            example_value: null,
            logical_term: null,
            data_service: { id: 3, service_code: 'API-1', name: 'Svc' },
          },
        ],
      },
    ]);
    const sql = calls[1].sql;
    expect(sql).toContain('l.consumer_id = $1');
    expect(sql).toContain("ds.status = 'active'");
    expect(calls[1].params).toEqual([4]);
  });

  it('404 for a missing consumer', async () => {
    const { dataSource } = makeSqlMock([]);
    await expect(new DataHubConsumerTermsQueryService(dataSource as never).sourceTableTerms(4, 5)).rejects.toThrow(
      'CONSUMER_NOT_FOUND',
    );
  });
});
